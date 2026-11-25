import { authorizeCronRequest } from "@/lib/cron-auth";
import { MediaErrorCode } from "@/lib/errors";
import {
  ORPHAN_CRON_DEADLINE_MS,
  ORPHAN_CRON_MAX_PAGES,
  type OrphanParkMediaSweepTotals,
} from "@/lib/park-media-orphan-sweep";

/** Sweep outcome shape; kept local so this module stays free of `server-only`. */
export type CronSweepRunResult =
  | { kind: "missing_supabase_url" }
  | {
      kind: "rpc_error";
      error: {
        code?: string;
        message?: string;
        details?: string | null;
        hint?: string | null;
      };
    }
  | {
      kind: "aborted";
      reason: string;
      unparsedCount?: number;
    }
  | ({ kind: "success" } & OrphanParkMediaSweepTotals);

export type CronSweepFn = (opts?: {
  maxPages?: number;
  deadlineMs?: number;
}) => Promise<CronSweepRunResult>;

export type CronErrorMapper = (error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}) => { errorCode?: string; details?: Record<string, unknown> };

export type CronUnexpectedMapper = (
  err: unknown,
) => { errorCode?: string; details?: Record<string, unknown> };

export type ParkMediaOrphanCronDeps = {
  authorize?: (request: Request) => boolean;
  sweep: CronSweepFn;
  mapRpcError?: CronErrorMapper;
  mapUnexpected?: CronUnexpectedMapper;
  maxPages?: number;
  deadlineMs?: number;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Cron HTTP contract for park-media orphan sweep.
 * Injectable deps keep the route unit-testable without `server-only` / Supabase.
 */
export async function handleParkMediaOrphanCron(
  request: Request,
  deps: ParkMediaOrphanCronDeps,
): Promise<Response> {
  const authorize = deps.authorize ?? ((req) => authorizeCronRequest(req));
  if (!authorize(request)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const maxPages = deps.maxPages ?? ORPHAN_CRON_MAX_PAGES;
  const deadlineMs = deps.deadlineMs ?? ORPHAN_CRON_DEADLINE_MS;

  try {
    const result = await deps.sweep({ maxPages, deadlineMs });

    if (result.kind === "missing_supabase_url") {
      return jsonResponse(
        {
          ok: false,
          errorCode: MediaErrorCode.MEDIA_SWEEP_ABORTED,
          details: { reason: "missing_supabase_url" },
        },
        500,
      );
    }

    if (result.kind === "rpc_error") {
      const mapped = deps.mapRpcError?.(result.error) ?? {
        errorCode: "DB_UNHANDLED_DATABASE_ERROR",
      };
      return jsonResponse(
        {
          ok: false,
          errorCode: mapped.errorCode,
          details: mapped.details,
        },
        502,
      );
    }

    if (result.kind === "aborted") {
      return jsonResponse(
        {
          ok: false,
          errorCode: MediaErrorCode.MEDIA_SWEEP_ABORTED,
          details: {
            reason: result.reason,
            ...(result.unparsedCount != null
              ? { unparsedCount: result.unparsedCount }
              : {}),
          },
        },
        409,
      );
    }

    const { kind, ...totals } = result;
    void kind;
    const body = {
      ok: true as boolean,
      ...totals,
      maxPages,
      deadlineMs,
    };

    // Degraded mid-sweep listing/abort after partial deletes must not look green.
    if (totals.stoppedEarly != null) {
      return jsonResponse({ ...body, ok: false }, 503);
    }

    return jsonResponse(body, 200);
  } catch (err) {
    const mapped = deps.mapUnexpected?.(err) ?? {
      errorCode: "DB_UNHANDLED_DATABASE_ERROR",
    };
    return jsonResponse(
      {
        ok: false,
        errorCode: mapped.errorCode,
        details: mapped.details,
      },
      500,
    );
  }
}
