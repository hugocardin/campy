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

export type OrphanSweepPage = {
  scanned: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  hasMore: boolean;
  nextAfter: string | null;
  paths: string[];
};

export type OrphanSweepListOutcome =
  | { kind: "ok"; page: OrphanSweepPage }
  | { kind: "abort"; reason: string; unparsedCount?: number }
  | { kind: "rpc_error"; code?: string; message?: string }
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
};

export type OrphanSweepLoopResult =
  | OrphanSweepLoopSuccess
  | { kind: "aborted"; reason: string; unparsedCount?: number }
  | { kind: "rpc_error"; code?: string; message?: string };

/** Stable client-facing stop code; never return a raw transport message. */
export function stableOrphanSweepStopCode(error: {
  code?: string;
  message?: string;
}): string {
  const code = error.code?.trim();
  // SQLSTATE is 5 alphanumeric chars (e.g. P0001, 23505, 42501).
  if (code && /^[A-Z0-9]{5}$/i.test(code)) return code;
  return "rpc_error";
}

export async function runOrphanParkMediaSweepLoop(opts: {
  maxPages?: number;
  listPage: (after: string | null) => Promise<OrphanSweepListOutcome>;
  removePaths: (
    paths: readonly string[],
  ) => Promise<{ removed: number; notRemoved: number }>;
  warn?: (...args: unknown[]) => void;
}): Promise<OrphanSweepLoopResult> {
  const maxPages = opts.maxPages ?? ORPHAN_SWEEP_MAX_PAGES;
  const warn = opts.warn ?? console.warn;

  let after: string | null = null;
  let scanned = 0;
  let skippedYoung = 0;
  let skippedUnknownAge = 0;
  let removed = 0;
  let notRemoved = 0;
  let hasMore = false;
  let stoppedEarly: string | null = null;

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
    const listed = await opts.listPage(after);

    if (listed.kind === "rpc_error") {
      if (page > 0) {
        logPartialAndStop(
          stableOrphanSweepStopCode(listed),
          page,
          listed.message,
        );
        break;
      }
      return {
        kind: "rpc_error",
        code: listed.code,
        message: listed.message,
      };
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
  const inviteMore = hasMore && removed > 0;

  if (notRemoved > 0 || inviteMore || stoppedEarly) {
    warn(
      "[park-media] orphan sweep incomplete",
      `scanned=${scanned}`,
      `removed=${removed}`,
      `notRemoved=${notRemoved}`,
      `skippedYoung=${skippedYoung}`,
      `skippedUnknownAge=${skippedUnknownAge}`,
      `hasMore=${hasMore}`,
      `stoppedEarly=${stoppedEarly ?? ""}`,
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
  };
}
