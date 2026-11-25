/**
 * Keyset orphan-sweep loop for park-media (#57).
 * Pure over list/remove callbacks so the branching is unit-testable.
 */

/** Cap orphan deletes per RPC page (matches SQL default). */
export const ORPHAN_SWEEP_LIMIT = 1000;
/**
 * Keyset pages per admin click. Keep small: each page re-scans the whole
 * bucket + storage.remove, and serverless maxDuration is tight.
 */
export const ORPHAN_SWEEP_MAX_PAGES = 5;

/**
 * Cron page budget. Near the admin click cap: each page re-scans the bucket
 * then runs Storage removes. Paired with {@link ORPHAN_CRON_DEADLINE_MS} so
 * the loop finishes under route `maxDuration` (60s).
 */
export const ORPHAN_CRON_MAX_PAGES = 8;

/**
 * Wall-clock stop for unattended runs (~20s headroom under `maxDuration` 60).
 * Deadline stops are clean (`stoppedEarly` stays null; `hitDeadline` true).
 */
export const ORPHAN_CRON_DEADLINE_MS = 40_000;

/** Totals returned by a successful orphan sweep run (admin + cron). */
export type OrphanParkMediaSweepTotals = {
  scanned: number;
  removed: number;
  notRemoved: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  hasMore: boolean;
  stoppedEarly: string | null;
  hitDeadline: boolean;
};

export type OrphanSweepPage = {
  scanned: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  hasMore: boolean;
  nextAfter: string | null;
  paths: string[];
};

/** Minimal RPC failure shape; callers may pass a real PostgrestError. */
export type OrphanSweepRpcFailure = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

/** Full run outcome (lives here so cron handler can `import type` without server-only). */
export type OrphanParkMediaSweepRunResult =
  | { kind: "missing_supabase_url" }
  | { kind: "rpc_error"; error: OrphanSweepRpcFailure }
  | {
      kind: "aborted";
      reason: string;
      unparsedCount?: number;
    }
  | ({ kind: "success" } & OrphanParkMediaSweepTotals);

export type OrphanSweepListOutcome<E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure> =
  | { kind: "ok"; page: OrphanSweepPage }
  | { kind: "abort"; reason: string; unparsedCount?: number }
  | { kind: "rpc_error"; error: E }
  | { kind: "invalid_payload" };

export type OrphanSweepLoopSuccess = {
  kind: "success";
  scanned: number;
  removed: number;
  notRemoved: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  /** Invite another click (hasMore && removed > 0). */
  hasMore: boolean;
  stoppedEarly: string | null;
  /** True when the wall-clock deadline stopped the loop before page/error stops. */
  hitDeadline: boolean;
};

export type OrphanSweepLoopResult<E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure> =
  | OrphanSweepLoopSuccess
  | { kind: "aborted"; reason: string; unparsedCount?: number }
  | { kind: "rpc_error"; error: E };

/** Stable client-facing stop code; never return a raw transport message. */
export function stableOrphanSweepStopCode(error: OrphanSweepRpcFailure): string {
  const code = error.code?.trim();
  // SQLSTATE is 5 alphanumeric chars (e.g. P0001, 23505, 42501).
  if (code && /^[A-Z0-9]{5}$/i.test(code)) return code;
  return "rpc_error";
}

export async function runOrphanParkMediaSweepLoop<
  E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure,
>(opts: {
  maxPages?: number;
  /**
   * Wall-clock budget (ms) from loop start. Before each new page, if elapsed
   * time exceeds this, stop cleanly (no `stoppedEarly`) so the platform does
   * not kill the process mid-remove. Prefer under serverless maxDuration.
   */
  deadlineMs?: number;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
  listPage: (after: string | null) => Promise<OrphanSweepListOutcome<E>>;
  removePaths: (
    paths: readonly string[],
  ) => Promise<{ removed: number; notRemoved: number }>;
  warn?: (...args: unknown[]) => void;
}): Promise<OrphanSweepLoopResult<E>> {
  const maxPages = opts.maxPages ?? ORPHAN_SWEEP_MAX_PAGES;
  const warn = opts.warn ?? console.warn;
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const deadlineMs =
    typeof opts.deadlineMs === "number" &&
    Number.isFinite(opts.deadlineMs) &&
    opts.deadlineMs > 0
      ? opts.deadlineMs
      : null;

  let after: string | null = null;
  let scanned = 0;
  let skippedYoung = 0;
  let skippedUnknownAge = 0;
  let removed = 0;
  let notRemoved = 0;
  let hasMore = false;
  let stoppedEarly: string | null = null;
  let hitDeadline = false;

  const logPartialAndStop = (reason: string, page: number, detail?: string) => {
    warn(
      "[park-media] orphan sweep stopped early after partial deletes",
      `page=${page}`,
      `reason=${reason}`,
      ...(detail ? [`detail=${detail}`] : []),
      `scanned=${scanned}`,
      `removed=${removed}`,
      `notRemoved=${notRemoved}`,
      `skippedYoung=${skippedYoung}`,
      `skippedUnknownAge=${skippedUnknownAge}`,
    );
    stoppedEarly = reason;
    hasMore = true;
  };

  for (let page = 0; page < maxPages; page += 1) {
    if (deadlineMs != null && now() - startedAt >= deadlineMs) {
      hitDeadline = true;
      hasMore = true;
      warn(
        "[park-media] orphan sweep hit wall-clock deadline",
        `deadlineMs=${deadlineMs}`,
        `page=${page}`,
        `scanned=${scanned}`,
        `removed=${removed}`,
        `notRemoved=${notRemoved}`,
      );
      break;
    }

    const listed = await opts.listPage(after);

    if (listed.kind === "rpc_error") {
      if (page > 0) {
        const detail = [listed.error.message, listed.error.details, listed.error.hint]
          .filter((part) => typeof part === "string" && part.trim())
          .join(" | ");
        logPartialAndStop(
          stableOrphanSweepStopCode(listed.error),
          page,
          detail || undefined,
        );
        break;
      }
      return { kind: "rpc_error", error: listed.error };
    }

    if (listed.kind === "invalid_payload") {
      if (page > 0) {
        logPartialAndStop("invalid_orphan_rpc_payload", page);
        break;
      }
      warn("[park-media] orphan sweep aborted — invalid RPC payload");
      return { kind: "aborted", reason: "invalid_orphan_rpc_payload" };
    }

    if (listed.kind === "abort") {
      if (page > 0) {
        logPartialAndStop(listed.reason, page);
        break;
      }
      warn(
        "[park-media] orphan sweep aborted —",
        listed.reason,
        "unparsed=",
        listed.unparsedCount,
      );
      return {
        kind: "aborted",
        reason: listed.reason,
        ...(listed.unparsedCount != null
          ? { unparsedCount: listed.unparsedCount }
          : {}),
      };
    }

    const parsed = listed.page;

    // Bucket totals from the first page only (later pages shrink after deletes).
    if (page === 0) {
      scanned = parsed.scanned;
      skippedYoung = parsed.skippedYoung;
      skippedUnknownAge = parsed.skippedUnknownAge;
    }
    hasMore = parsed.hasMore;

    if (parsed.paths.length === 0) {
      hasMore = false;
      break;
    }

    const batch = await opts.removePaths(parsed.paths);
    removed += batch.removed;
    notRemoved += batch.notRemoved;

    if (!parsed.hasMore || !parsed.nextAfter) {
      hasMore = false;
      break;
    }
    // Stuck or partial page: always advance the keyset so leading
    // unremovable paths cannot block the rest of the bucket.
    after = parsed.nextAfter;
  }

  // Invite another click only when more remain AND this run made progress
  // (avoids a forever "run again" loop when every page removes 0).
  // Deadline exhaustion also invites another run when progress was made.
  const inviteMore = hasMore && removed > 0;

  if (notRemoved > 0 || inviteMore || stoppedEarly || hitDeadline) {
    warn(
      "[park-media] orphan sweep incomplete",
      `scanned=${scanned}`,
      `removed=${removed}`,
      `notRemoved=${notRemoved}`,
      `skippedYoung=${skippedYoung}`,
      `skippedUnknownAge=${skippedUnknownAge}`,
      `hasMore=${hasMore}`,
      `stoppedEarly=${stoppedEarly ?? ""}`,
      `hitDeadline=${hitDeadline}`,
      `inviteMore=${inviteMore}`,
    );
  }

  return {
    kind: "success",
    scanned,
    removed,
    notRemoved,
    skippedYoung,
    skippedUnknownAge,
    hasMore: inviteMore,
    stoppedEarly,
    hitDeadline,
  };
}
