import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  handleParkMediaOrphanCron,
  type CronSweepFn,
} from "./park-media-orphan-cron-handler";
import type {
  OrphanParkMediaSweepRunResult,
  OrphanParkMediaSweepTotals,
} from "./park-media-orphan-sweep";

function req(authorization?: string, method = "GET"): Request {
  const headers = new Headers();
  if (authorization != null) headers.set("authorization", authorization);
  return new Request("https://example.test/api/cron/park-media-orphan-sweep", {
    method,
    headers,
  });
}

function okTotals(
  partial: Partial<OrphanParkMediaSweepTotals> = {},
): OrphanParkMediaSweepTotals {
  return {
    scanned: 10,
    removed: 2,
    notRemoved: 0,
    skippedYoung: 1,
    skippedUnknownAge: 0,
    hasMore: false,
    stoppedEarly: null,
    hitDeadline: false,
    ...partial,
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("handleParkMediaOrphanCron", () => {
  const prevSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
  });

  it("401 without calling sweep when unauthorized (injected authorize)", async () => {
    let called = 0;
    const sweep: CronSweepFn = async () => {
      called += 1;
      return { kind: "success", ...okTotals() };
    };

    const res = await handleParkMediaOrphanCron(req(), {
      authorize: () => false,
      sweep,
    });

    assert.equal(res.status, 401);
    assert.equal(called, 0);
    assert.deepEqual(await readJson(res), {
      ok: false,
      error: "unauthorized",
    });
  });

  it("uses real authorizeCronRequest when authorize is omitted", async () => {
    let called = 0;
    const sweep: CronSweepFn = async () => {
      called += 1;
      return { kind: "success", ...okTotals({ removed: 1 }) };
    };

    delete process.env.CRON_SECRET;
    const unset = await handleParkMediaOrphanCron(req("Bearer anything"), {
      sweep,
    });
    assert.equal(unset.status, 401);
    assert.equal(called, 0);

    process.env.CRON_SECRET = "cron-test-secret";
    const wrong = await handleParkMediaOrphanCron(req("Bearer wrong-secret"), {
      sweep,
    });
    assert.equal(wrong.status, 401);
    assert.equal(called, 0);

    const ok = await handleParkMediaOrphanCron(
      req("Bearer cron-test-secret"),
      { sweep },
    );
    assert.equal(ok.status, 200);
    assert.equal(called, 1);
  });

  it("GET and POST both run the sweep when authorized", async () => {
    let called = 0;
    const sweep: CronSweepFn = async () => {
      called += 1;
      return { kind: "success", ...okTotals({ removed: called }) };
    };

    const getRes = await handleParkMediaOrphanCron(req("Bearer x", "GET"), {
      authorize: () => true,
      sweep,
    });
    const postRes = await handleParkMediaOrphanCron(req("Bearer x", "POST"), {
      authorize: () => true,
      sweep,
    });

    assert.equal(getRes.status, 200);
    assert.equal(postRes.status, 200);
    assert.equal(called, 2);
  });

  it("maps missing URL / rpc / abort / unexpected to status codes", async () => {
    const cases: Array<{
      result?: OrphanParkMediaSweepRunResult;
      throwErr?: Error;
      status: number;
    }> = [
      { result: { kind: "missing_supabase_url" }, status: 500 },
      {
        result: {
          kind: "rpc_error",
          error: { code: "57014", message: "cancel" },
        },
        status: 502,
      },
      {
        result: { kind: "aborted", reason: "unparsed_media_urls" },
        status: 409,
      },
      { throwErr: new Error("boom"), status: 500 },
    ];

    for (const c of cases) {
      const res = await handleParkMediaOrphanCron(req("Bearer x"), {
        authorize: () => true,
        sweep: async () => {
          if (c.throwErr) throw c.throwErr;
          return c.result!;
        },
        mapRpcError: () => ({ errorCode: "DB_TIMEOUT" }),
        mapUnexpected: () => ({ errorCode: "DB_UNHANDLED_DATABASE_ERROR" }),
      });
      assert.equal(res.status, c.status);
      const body = await readJson(res);
      assert.equal(body.ok, false);
    }
  });

  it("returns 503 when stoppedEarly is set (degraded run)", async () => {
    const res = await handleParkMediaOrphanCron(req("Bearer x"), {
      authorize: () => true,
      sweep: async () => ({
        kind: "success",
        ...okTotals({ removed: 3, stoppedEarly: "rpc_error", hasMore: true }),
      }),
    });
    assert.equal(res.status, 503);
    const body = await readJson(res);
    assert.equal(body.ok, false);
    assert.equal(body.stoppedEarly, "rpc_error");
    assert.equal(body.removed, 3);
  });

  it("returns 200 with totals on a clean success (deadline OK)", async () => {
    const res = await handleParkMediaOrphanCron(req("Bearer x"), {
      authorize: () => true,
      maxPages: 8,
      deadlineMs: 40_000,
      sweep: async (opts) => {
        assert.equal(opts?.maxPages, 8);
        assert.equal(opts?.deadlineMs, 40_000);
        return {
          kind: "success",
          ...okTotals({ hitDeadline: true, hasMore: true, removed: 4 }),
        };
      },
    });
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.equal(body.ok, true);
    assert.equal(body.hitDeadline, true);
    assert.equal(body.maxPages, 8);
    assert.equal(body.deadlineMs, 40_000);
  });
});
