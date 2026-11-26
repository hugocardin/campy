import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import {
  orphanPathsFromRpcResult,
  parseOrphanParkMediaRpc,
  requireNonNegInt,
} from "@/lib/park-media-orphan-rpc";
import {
  ORPHAN_CRON_DEADLINE_MS,
  ORPHAN_CRON_MAX_PAGES,
  ORPHAN_SWEEP_LIMIT,
  ORPHAN_SWEEP_MAX_PAGES,
  runOrphanParkMediaSweepLoop,
  type OrphanParkMediaSweepRunResult,
  type OrphanParkMediaSweepTotals,
  type OrphanSweepListOutcome,
  type OrphanSweepLoopResult,
} from "@/lib/park-media-orphan-sweep";
import {
  PARK_MEDIA_ORPHAN_GRACE_MS,
  removeParkMediaObjectPaths,
} from "@/lib/park-media-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin_server";

export {
  ORPHAN_CRON_DEADLINE_MS,
  ORPHAN_CRON_MAX_PAGES,
  type OrphanParkMediaSweepRunResult,
  type OrphanParkMediaSweepTotals,
};

/** Sample size for structured run logs (audit / “missing photo” traces). */
const REMOVED_PATH_SAMPLE = 5;

/**
 * Fail-closed orphan sweep shared by the platform-admin action and the cron
 * route. Uses service-role + `list_orphan_park_media` (same path as #65).
 *
 * Listing + orphan math run in SQL (`list_orphan_park_media` over
 * `storage.objects` anti-joined to cover/photos). Fail-closed: aborts (no
 * deletes) on missing project URL, unparseable media URLs, or RPC shape
 * errors. Skips objects younger than the grace window (upload→commit race;
 * assumes browser upload → Server Action commit finishes well within
 * {@link PARK_MEDIA_ORPHAN_GRACE_MS} — typically seconds, not hours) and
 * NULL `created_at` (counted separately). Keyset-batched via `p_limit` /
 * `p_after` / `next_after` (auto-advances; stuck pages skip ahead via
 * `nextAfter` and count as `notRemoved`). `scanned` / skipped counts are
 * pinned from page 0 (bucket at start). A failure after page 0 returns
 * success with totals so far + `stoppedEarly` instead of discarding deletes.
 * Storage remove failures are `notRemoved`. Cron also applies a wall-clock
 * deadline so the platform does not kill the process mid-loop.
 */
export async function executeOrphanParkMediaSweep(opts?: {
  maxPages?: number;
  deadlineMs?: number;
}): Promise<OrphanParkMediaSweepRunResult<PostgrestError>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    console.warn("[park-media] orphan sweep aborted — missing project URL");
    return { kind: "missing_supabase_url" };
  }

  const supabase = getSupabaseAdmin();
  const graceSeconds = Math.floor(PARK_MEDIA_ORPHAN_GRACE_MS / 1000);
  const maxPages = opts?.maxPages ?? ORPHAN_SWEEP_MAX_PAGES;
  const deadlineMs = opts?.deadlineMs;
  const removedSample: string[] = [];

  const loop: OrphanSweepLoopResult<PostgrestError> =
    await runOrphanParkMediaSweepLoop<PostgrestError>({
      maxPages,
      ...(deadlineMs != null ? { deadlineMs } : {}),
      listPage: async (
        after,
      ): Promise<OrphanSweepListOutcome<PostgrestError>> => {
        const { data, error } = await supabase.rpc("list_orphan_park_media", {
          p_project_url: supabaseUrl,
          p_grace_seconds: graceSeconds,
          p_limit: ORPHAN_SWEEP_LIMIT,
          p_after: after,
        });
        if (error) {
          return { kind: "rpc_error", error };
        }

        const listed = parseOrphanParkMediaRpc(data);
        if (!listed) return { kind: "invalid_payload" };

        if (listed.ok !== true) {
          const reason =
            typeof listed.reason === "string" && listed.reason
              ? listed.reason
              : "orphan_rpc_aborted";
          const unparsedCount = requireNonNegInt(listed.unparsed_count);
          return {
            kind: "abort",
            reason,
            ...(unparsedCount != null ? { unparsedCount } : {}),
          };
        }

        const parsed = orphanPathsFromRpcResult(listed);
        if (!parsed) return { kind: "invalid_payload" };
        return { kind: "ok", page: parsed };
      },
      removePaths: async (paths) => {
        const batch = await removeParkMediaObjectPaths(supabase, paths);
        for (const path of batch.removedPaths) {
          if (removedSample.length >= REMOVED_PATH_SAMPLE) break;
          removedSample.push(path);
        }
        return {
          removed: batch.removed,
          notRemoved: batch.notRemoved,
        };
      },
    });

  if (loop.kind === "rpc_error") {
    return { kind: "rpc_error", error: loop.error };
  }
  if (loop.kind === "aborted") {
    return {
      kind: "aborted",
      reason: loop.reason,
      ...(loop.unparsedCount != null
        ? { unparsedCount: loop.unparsedCount }
        : {}),
    };
  }

  const totals: OrphanParkMediaSweepTotals = {
    scanned: loop.scanned,
    removed: loop.removed,
    notRemoved: loop.notRemoved,
    skippedYoung: loop.skippedYoung,
    skippedUnknownAge: loop.skippedUnknownAge,
    hasMore: loop.hasMore,
    stoppedEarly: loop.stoppedEarly,
    hitDeadline: loop.hitDeadline,
  };

  console.info("[park-media] orphan sweep run", {
    ...totals,
    removedSample,
    maxPages,
    deadlineMs: deadlineMs ?? null,
    graceSeconds,
  });

  return { kind: "success", ...totals };
}
