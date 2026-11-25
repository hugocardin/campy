import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orphanPathsFromRpcResult,
  parseOrphanParkMediaRpc,
  requireNonNegInt,
} from "./park-media-orphan-rpc";

describe("park-media orphan RPC payload", () => {
  it("parses object and JSON-string payloads", () => {
    assert.deepEqual(parseOrphanParkMediaRpc({ ok: true, scanned: 1 }), {
      ok: true,
      scanned: 1,
    });
    assert.deepEqual(
      parseOrphanParkMediaRpc('{"ok":false,"reason":"unparsed_media_urls"}'),
      { ok: false, reason: "unparsed_media_urls" },
    );
    assert.equal(parseOrphanParkMediaRpc("not-json"), null);
    assert.equal(parseOrphanParkMediaRpc(null), null);
    assert.equal(parseOrphanParkMediaRpc(42), null);
  });

  it("requireNonNegInt rejects non-numbers", () => {
    assert.equal(requireNonNegInt(0), 0);
    assert.equal(requireNonNegInt(3.9), 3);
    assert.equal(requireNonNegInt(-1), null);
    assert.equal(requireNonNegInt("1"), null);
    assert.equal(requireNonNegInt(undefined), null);
  });

  it("orphanPathsFromRpcResult fail-closes on bad ok payloads", () => {
    assert.equal(
      orphanPathsFromRpcResult({ ok: false, reason: "unparsed_media_urls" }),
      null,
    );
    assert.equal(
      orphanPathsFromRpcResult({
        ok: true,
        scanned: "1",
        skipped_young: 0,
        skipped_unknown_age: 0,
        has_more: false,
        next_after: null,
        orphans: [],
      }),
      null,
    );
    assert.equal(
      orphanPathsFromRpcResult({
        ok: true,
        scanned: 1,
        skipped_young: 0,
        skipped_unknown_age: 0,
        has_more: false,
        next_after: null,
        orphans: "nope",
      }),
      null,
    );
    assert.equal(
      orphanPathsFromRpcResult({
        ok: true,
        scanned: 1,
        skipped_young: 0,
        skipped_unknown_age: 0,
        has_more: false,
        next_after: null,
        orphans: ["ok", "../x"],
      }),
      null,
    );
    assert.equal(
      orphanPathsFromRpcResult({
        ok: true,
        scanned: 1,
        skipped_young: 0,
        skipped_unknown_age: 0,
        has_more: false,
        next_after: null,
        orphans: [{ path: "a/b.jpg" }],
      }),
      null,
    );
  });

  it("accepts path strings and next_after", () => {
    assert.deepEqual(
      orphanPathsFromRpcResult({
        ok: true,
        scanned: 2,
        skipped_young: 1,
        skipped_unknown_age: 0,
        has_more: true,
        next_after: "c/d.jpg",
        orphans: ["a/b.jpg", "c/d.jpg"],
      }),
      {
        scanned: 2,
        skippedYoung: 1,
        skippedUnknownAge: 0,
        hasMore: true,
        nextAfter: "c/d.jpg",
        paths: ["a/b.jpg", "c/d.jpg"],
      },
    );
  });
});
