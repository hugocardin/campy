import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { removePathsInChunks } from "./park-media-remove-paths";

describe("removePathsInChunks", () => {
  it("samples only successful chunks when an earlier chunk fails", async () => {
    const calls: string[][] = [];
    const result = await removePathsInChunks(
      ["a/1", "a/2", "b/1", "b/2", "b/3"],
      async (chunk) => {
        calls.push([...chunk]);
        // First chunk fails; second succeeds.
        return { ok: calls.length > 1 };
      },
      2,
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

  it("drops unsafe paths before calling removeChunk", async () => {
    const seen: string[] = [];
    const result = await removePathsInChunks(
      ["ok/1", "../evil", "", "ok/2"],
      async (chunk) => {
        seen.push(...chunk);
        return { ok: true };
      },
      10,
    );
    assert.deepEqual(seen, ["ok/1", "ok/2"]);
    assert.deepEqual(result.removedPaths, ["ok/1", "ok/2"]);
    assert.equal(result.notRemoved, 0);
  });

  it("counts a thrown chunk as notRemoved", async () => {
    const result = await removePathsInChunks(
      ["x/1", "x/2"],
      async () => {
        throw new Error("network");
      },
      10,
    );
    assert.equal(result.removed, 0);
    assert.equal(result.notRemoved, 2);
    assert.deepEqual(result.removedPaths, []);
  });
});
