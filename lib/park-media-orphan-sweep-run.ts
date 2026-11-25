import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import {
  orphanPathsFromRpcResult,
  parseOrphanParkMediaRpc,
  requireNonNegInt,
} from "@/lib/park-media-orphan-rpc";
import {
  ORPHAN_SWEEP_LIMIT,
  ORPHAN_SWEEP_MAX_PAGES,
  runOrphanParkMediaSweepLoop,
  type OrphanSweepListOutcome,
  type OrphanSweepLoopResult,
} from "@/lib/park-media-orphan-sweep";
import {
  PARK_MEDIA_ORPHAN_GRACE_MS,
  removeParkMediaObjectPaths,
} from "@/lib/park-media-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin_server";

/**
 * Unattended cron page budget. Higher than the admin click cap so one
 * scheduled run clears a moderate backlog; still bounded for serverless time.
 */
export const ORPHAN_CRON_MAX_PAGES = 20;

export type OrphanParkMediaSweepTotals = {
  scanned: number;
  removed: number;
  notRemoved: number;
  skippedYoung: number;
  skippedUnknownAge: number;
  hasMore: boolean;
  stoppedEarly: string | null;
};

export type OrphanParkMediaSweepRunResult =
  | { kind: "missing_supabase_url" }
  | { kind: "rpc_error"; error: PostgrestError }
  | {
      kind: "aborted";
      reason: string;
      unparsedCount?: number;
    }
  | ({ kind: "success" } & OrphanParkMediaSweepTotals);

/**
 * Fail-closed orphan sweep shared by the platform-admin action and the cron
 * route. Uses service-role + `list_orphan_park_media` (same path as #65).
 */
export async function executeOrphanParkMediaSweep(opts?: {
  maxPages?: number;
}): Promise<OrphanParkMediaSweepRunResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    console.warn("[park-media] orphan sweep aborted — missing project URL");
    return { kind: "missing_supabase_url" };
  }

  const supabase = getSupabaseAdmin();
  const graceSeconds = Math.floor(PARK_MEDIA_ORPHAN_GRACE_MS / 1000);
  const maxPages = opts?.maxPages ?? ORPHAN_SWEEP_MAX_PAGES;

  const loop: OrphanSweepLoopResult<PostgrestError> =
    await runOrphanParkMediaSweepLoop<PostgrestError>({
      maxPages,
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
      removePaths: (paths) => removeParkMediaObjectPaths(supabase, paths),
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

  return {
    kind: "success",
    scanned: loop.scanned,
    removed: loop.removed,
    notRemoved: loop.notRemoved,
    skippedYoung: loop.skippedYoung,
    skippedUnknownAge: loop.skippedUnknownAge,
    hasMore: loop.hasMore,
    stoppedEarly: loop.stoppedEarly,
  };
}
