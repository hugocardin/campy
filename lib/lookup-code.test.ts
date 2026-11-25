import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeLookupCode } from "./lookup-code";

describe("normalizeLookupCode", () => {
  it("trims and uppercases a valid code", () => {
    assert.deepEqual(normalizeLookupCode("  wifi  ", 64), {
      ok: true,
      code: "WIFI",
    });
  });

  it("rejects empty / whitespace-only / non-string input", () => {
    assert.deepEqual(normalizeLookupCode("", 64), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeLookupCode("   ", 64), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeLookupCode(null, 64), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeLookupCode(42, 64), {
      ok: false,
      reason: "missing",
    });
  });

  it("rejects over-long codes after uppercase expansion", () => {
    assert.deepEqual(normalizeLookupCode("a".repeat(65), 64), {
      ok: false,
      reason: "too_long",
    });
    const expanded = "ß".repeat(64);
    assert.equal(expanded.toUpperCase().length, 128);
    assert.deepEqual(normalizeLookupCode(expanded, 64), {
      ok: false,
      reason: "too_long",
    });
  });
});
