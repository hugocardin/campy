import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { removePathsInChunks } from "./park-media-remove-paths";

describe("removePathsInChunks", () => {
  const silent = () => {};

  it("samples only successful chunks when an earlier chunk fails", async () => {
    const calls: string[][] = [];
    const result = await removePathsInChunks(
      ["a/1", "a/2", "b/1", "b/2", "b/3"],
      async (chunk) => {
        calls.push([...chunk]);
        // First chunk fails; later succeed.
        return { ok: calls.length > 1 };
      },
      2,
      silent,
    );

    assert.equal(result.removed, 3);
    assert.equal(result.notRemoved, 2);
    assert.deepEqual(result.removedPaths, ["b/1", "b/2", "b/3"]);
    assert.deepEqual(calls, [
      ["a/1", "a/2"],
      ["b/1", "b/2"],
      ["b/3"],
    ]);
  });

  it("prefers callback removedPaths over the full chunk for the sample", async () => {
    const result = await removePathsInChunks(
      ["ok/1", "ok/2", "ok/3"],
      async () => ({ ok: true, removedPaths: ["ok/1", "ok/3"] }),
      10,
      silent,
    );
    assert.equal(result.removed, 3); // counters still count whole chunk
    assert.deepEqual(result.removedPaths, ["ok/1", "ok/3"]);
  });

  it("keeps an empty removedPaths from the callback (no chunk fallback)", async () => {
    const result = await removePathsInChunks(
      ["gone/1"],
      async () => ({ ok: true, removedPaths: [] }),
      10,
      silent,
    );
    assert.equal(result.removed, 1);
    assert.deepEqual(result.removedPaths, []);
  });

  it("counts unsafe paths as notRemoved and keeps photo..jpg", async () => {
    const warnings: unknown[][] = [];
    const seen: string[] = [];
    const result = await removePathsInChunks(
      ["ok/1", "../evil", "photo..jpg", "", "nested/../x", "ok/2"],
      async (chunk) => {
        seen.push(...chunk);
        return { ok: true };
      },
      10,
      (...args) => warnings.push(args),
    );
    assert.deepEqual(seen, ["ok/1", "photo..jpg", "ok/2"]);
    assert.deepEqual(result.removedPaths, ["ok/1", "photo..jpg", "ok/2"]);
    assert.equal(result.removed, 3);
    assert.equal(result.notRemoved, 3); // ../evil, "", nested/../x
    assert.equal(warnings.length, 1);
  });

  it("counts a thrown chunk as notRemoved and logs the error", async () => {
    const warnings: unknown[][] = [];
    const result = await removePathsInChunks(
      ["x/1", "x/2"],
      async () => {
        throw new Error("network");
      },
      10,
      (...args) => warnings.push(args),
    );
    assert.equal(result.removed, 0);
    assert.equal(result.notRemoved, 2);
    assert.deepEqual(result.removedPaths, []);
    assert.ok(warnings.some((w) => String(w[0]).includes("threw")));
  });
});
