import { authorizeCronRequest } from "@/lib/cron-auth";
import { DbErrorCode, MediaErrorCode } from "@/lib/errors";
import {
  ORPHAN_CRON_DEADLINE_MS,
  ORPHAN_CRON_MAX_PAGES,
  type OrphanParkMediaSweepRunResult,
  type OrphanSweepRpcFailure,
} from "@/lib/park-media-orphan-sweep";

export type CronSweepFn<E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure> =
  (opts?: {
    maxPages?: number;
    deadlineMs?: number;
  }) => Promise<OrphanParkMediaSweepRunResult<E>>;

export type CronErrorMapper<E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure> =
  (error: E) => { errorCode?: string; details?: Record<string, unknown> };

export type CronUnexpectedMapper = (
  err: unknown,
) => { errorCode?: string; details?: Record<string, unknown> };

export type ParkMediaOrphanCronDeps<
  E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure,
> = {
  /**
   * Test-only override. Production route must omit this so the real
   * `authorizeCronRequest` (Bearer `CRON_SECRET`) runs.
   */
  authorize?: (request: Request) => boolean;
  sweep: CronSweepFn<E>;
  mapRpcError?: CronErrorMapper<E>;
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
export async function handleParkMediaOrphanCron<
  E extends OrphanSweepRpcFailure = OrphanSweepRpcFailure,
>(
  request: Request,
  deps: ParkMediaOrphanCronDeps<E>,
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
        errorCode: DbErrorCode.DB_UNHANDLED_DATABASE_ERROR,
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

    if (totals.stoppedEarly != null) {
      // Degraded mid-sweep listing/abort after partial deletes must not look green.
      return jsonResponse(
        {
          ok: false,
          ...totals,
          maxPages,
          deadlineMs,
        },
        503,
      );
    }

    return jsonResponse(
      {
        ok: true,
        ...totals,
        maxPages,
        deadlineMs,
      },
      200,
    );
  } catch (err) {
    const mapped = deps.mapUnexpected?.(err) ?? {
      errorCode: DbErrorCode.DB_UNHANDLED_DATABASE_ERROR,
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
