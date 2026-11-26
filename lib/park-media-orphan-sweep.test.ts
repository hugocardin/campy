import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORPHAN_SWEEP_MAX_PAGES,
  runOrphanParkMediaSweepLoop,
  stableOrphanSweepStopCode,
  type OrphanSweepListOutcome,
  type OrphanSweepPage,
} from "./park-media-orphan-sweep";

function okPage(partial: Partial<OrphanSweepPage> & { paths: string[] }): OrphanSweepPage {
  return {
    scanned: partial.scanned ?? 100,
    skippedYoung: partial.skippedYoung ?? 0,
    skippedUnknownAge: partial.skippedUnknownAge ?? 0,
    hasMore: partial.hasMore ?? false,
    nextAfter: partial.nextAfter ?? null,
    paths: partial.paths,
  };
}

describe("stableOrphanSweepStopCode", () => {
  it("keeps SQLSTATE and maps transport noise to rpc_error", () => {
    assert.equal(stableOrphanSweepStopCode({ code: "57014" }), "57014");
    assert.equal(
      stableOrphanSweepStopCode({
        message: "TypeError: fetch failed: ECONNRESET",
      }),
      "rpc_error",
    );
    assert.equal(
      stableOrphanSweepStopCode({ code: "not-a-sqlstate", message: "boom" }),
      "rpc_error",
    );
  });
});

describe("runOrphanParkMediaSweepLoop", () => {
  const silent = () => {};

  it("all orphans over 2 pages: pins scanned from page 0 and invites more only with progress", async () => {
    const afters: Array<string | null> = [];
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      listPage: async (after) => {
        afters.push(after);
        if (after == null) {
          return {
            kind: "ok",
            page: okPage({
              scanned: 1500,
              skippedYoung: 2,
              hasMore: true,
              nextAfter: "a/999",
              paths: Array.from({ length: 1000 }, (_, i) => `a/${i}`),
            }),
          };
        }
        return {
          kind: "ok",
          page: okPage({
            scanned: 500,
            skippedYoung: 0,
            hasMore: false,
            nextAfter: "b/499",
            paths: Array.from({ length: 500 }, (_, i) => `b/${i}`),
          }),
        };
      },
      removePaths: async (paths) => ({
        removed: paths.length,
        notRemoved: 0,
      }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(result.scanned, 1500);
    assert.equal(result.skippedYoung, 2);
    assert.equal(result.removed, 1500);
    assert.equal(result.hasMore, false);
    assert.equal(result.stoppedEarly, null);
    assert.deepEqual(afters, [null, "a/999"]);
  });

  it("page-1 error after page-0 deletes → success + stoppedEarly stable code", async () => {
    let calls = 0;
    const warnings: unknown[][] = [];
    const result = await runOrphanParkMediaSweepLoop({
      warn: (...args) => warnings.push(args),
      listPage: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            kind: "ok",
            page: okPage({
              scanned: 2000,
              hasMore: true,
              nextAfter: "p0",
              paths: ["x/1", "x/2"],
            }),
          };
        }
        return {
          kind: "rpc_error",
          error: {
            message: "TypeError: fetch failed: ECONNRESET",
            details: "socket hang up",
            hint: null,
          },
        };
      },
      removePaths: async (paths) => ({
        removed: paths.length,
        notRemoved: 0,
      }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(result.removed, 2);
    assert.equal(result.scanned, 2000);
    assert.equal(result.stoppedEarly, "rpc_error");
    assert.equal(result.hasMore, true);
    assert.ok(
      warnings.some((w) =>
        w.some(
          (x) =>
            typeof x === "string" &&
            x.includes("ECONNRESET") &&
            x.includes("socket hang up"),
        ),
      ),
      "full transport message + details should be logged, not returned",
    );
  });

  it("page-0 rpc error aborts without success totals and keeps original error", async () => {
    const original = {
      code: "57014",
      message: "canceling statement due to statement timeout",
      details: "list_orphan_park_media",
      hint: "raise the statement_timeout",
    };
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      listPage: async () => ({
        kind: "rpc_error",
        error: original,
      }),
      removePaths: async () => ({ removed: 0, notRemoved: 0 }),
    });
    assert.deepEqual(result, {
      kind: "rpc_error",
      error: original,
    });
    if (result.kind === "rpc_error") {
      assert.equal(result.error, original);
    }
  });

  it("stuck pages skip ahead; zero-remove click does not invite more", async () => {
    const afters: Array<string | null> = [];
    let page = 0;
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      maxPages: 3,
      listPage: async (after) => {
        afters.push(after);
        page += 1;
        return {
          kind: "ok",
          page: okPage({
            scanned: 3000,
            hasMore: page < 3,
            nextAfter: `stuck/${page}`,
            paths: [`stuck/${page}/a`, `stuck/${page}/b`],
          }),
        };
      },
      removePaths: async (paths) => ({
        removed: 0,
        notRemoved: paths.length,
      }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(result.removed, 0);
    assert.equal(result.notRemoved, 6);
    assert.equal(result.hasMore, false);
    assert.equal(result.stoppedEarly, null);
    assert.deepEqual(afters, [null, "stuck/1", "stuck/2"]);
  });

  it("page cap invites more when removals happened", async () => {
    let n = 0;
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      maxPages: 2,
      listPage: async () => {
        n += 1;
        return {
          kind: "ok",
          page: okPage({
            scanned: 5000,
            hasMore: true,
            nextAfter: `c/${n}`,
            paths: [`c/${n}/a`],
          }),
        };
      },
      removePaths: async () => ({ removed: 1, notRemoved: 0 }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(result.removed, 2);
    assert.equal(result.hasMore, true);
    assert.ok(ORPHAN_SWEEP_MAX_PAGES >= 1);
  });

  it("abort after page 0 deletes returns stoppedEarly with abort reason", async () => {
    let calls = 0;
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      listPage: async (): Promise<OrphanSweepListOutcome> => {
        calls += 1;
        if (calls === 1) {
          return {
            kind: "ok",
            page: okPage({
              scanned: 10,
              hasMore: true,
              nextAfter: "n1",
              paths: ["ok/1"],
            }),
          };
        }
        return {
          kind: "abort",
          reason: "unparsed_media_urls",
          unparsedCount: 1,
        };
      },
      removePaths: async () => ({ removed: 1, notRemoved: 0 }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(result.removed, 1);
    assert.equal(result.stoppedEarly, "unparsed_media_urls");
    assert.equal(result.hasMore, true);
    assert.equal(result.hitDeadline, false);
  });

  it("deadline stops before a new page without setting stoppedEarly", async () => {
    let pages = 0;
    let t = 0;
    const result = await runOrphanParkMediaSweepLoop({
      warn: silent,
      maxPages: 10,
      deadlineMs: 100,
      now: () => t,
      listPage: async () => {
        pages += 1;
        t = 150; // next page will see deadline exceeded
        return {
          kind: "ok",
          page: okPage({
            scanned: 100,
            hasMore: true,
            nextAfter: `d/${pages}`,
            paths: [`d/${pages}/a`],
          }),
        };
      },
      removePaths: async () => ({ removed: 1, notRemoved: 0 }),
    });

    assert.equal(result.kind, "success");
    if (result.kind !== "success") return;
    assert.equal(pages, 1);
    assert.equal(result.removed, 1);
    assert.equal(result.stoppedEarly, null);
    assert.equal(result.hitDeadline, true);
    assert.equal(result.hasMore, true);
  });
});
