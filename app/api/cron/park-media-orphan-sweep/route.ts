import { handleParkMediaOrphanCron } from "@/lib/park-media-orphan-cron-handler";
import { executeOrphanParkMediaSweep } from "@/lib/park-media-orphan-sweep-run";
import {
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";

export const runtime = "nodejs";
/** Allow a multi-page Storage sweep on platforms that honor this hint. */
export const maxDuration = 60;

async function handleCron(request: Request): Promise<Response> {
  return handleParkMediaOrphanCron(request, {
    sweep: executeOrphanParkMediaSweep,
    mapRpcError: (error) => {
      const mapped = mapPostgrestError(error as never);
      return mapped.success
        ? {}
        : { errorCode: mapped.errorCode, details: mapped.details };
    },
    mapUnexpected: (err) => {
      const mapped = handleUnexpectedError(err);
      return mapped.success
        ? {}
        : { errorCode: mapped.errorCode, details: mapped.details };
    },
  });
}

/**
 * Vercel Cron only sends GET, so GET is intentionally state-changing here.
 * Bearer `CRON_SECRET` is required; crawlers/prefetch without it get 401.
 * Prefer POST for manual / pg_net / Actions smoke.
 */
export async function GET(request: Request): Promise<Response> {
  return handleCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCron(request);
}
