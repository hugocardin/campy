import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { MediaErrorCode } from "@/lib/errors";
import {
  executeOrphanParkMediaSweep,
  ORPHAN_CRON_MAX_PAGES,
} from "@/lib/park-media-orphan-sweep-run";
import {
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";

export const runtime = "nodejs";
/** Allow a multi-page Storage sweep on platforms that honor this hint. */
export const maxDuration = 60;

async function handleCron(request: Request): Promise<Response> {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeOrphanParkMediaSweep({
      maxPages: ORPHAN_CRON_MAX_PAGES,
    });

    if (result.kind === "missing_supabase_url") {
      return NextResponse.json(
        {
          ok: false,
          errorCode: MediaErrorCode.MEDIA_SWEEP_ABORTED,
          details: { reason: "missing_supabase_url" },
        },
        { status: 500 },
      );
    }

    if (result.kind === "rpc_error") {
      const mapped = mapPostgrestError(result.error);
      return NextResponse.json(
        {
          ok: false,
          errorCode: mapped.success ? undefined : mapped.errorCode,
          details: mapped.success ? undefined : mapped.details,
        },
        { status: 502 },
      );
    }

    if (result.kind === "aborted") {
      return NextResponse.json(
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
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      removed: result.removed,
      notRemoved: result.notRemoved,
      skippedYoung: result.skippedYoung,
      skippedUnknownAge: result.skippedUnknownAge,
      hasMore: result.hasMore,
      stoppedEarly: result.stoppedEarly,
      maxPages: ORPHAN_CRON_MAX_PAGES,
    });
  } catch (err) {
    const mapped = handleUnexpectedError(err);
    return NextResponse.json(
      {
        ok: false,
        errorCode: mapped.success ? undefined : mapped.errorCode,
        details: mapped.success ? undefined : mapped.details,
      },
      { status: 500 },
    );
  }
}

/** Vercel Cron invokes GET; allow POST for manual / pg_net smoke. */
export async function GET(request: Request): Promise<Response> {
  return handleCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleCron(request);
}
