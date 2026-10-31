import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AMENITY_CODE_MAX_LENGTH, normalizeAmenityCode } from "./code";

describe("normalizeAmenityCode", () => {
  it("trims and uppercases a valid code", () => {
    assert.deepEqual(normalizeAmenityCode("  wifi  "), {
      ok: true,
      code: "WIFI",
    });
  });

  it("rejects empty / whitespace-only / non-string input", () => {
    assert.deepEqual(normalizeAmenityCode(""), { ok: false, reason: "missing" });
    assert.deepEqual(normalizeAmenityCode("   "), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeAmenityCode(null), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeAmenityCode(42), {
      ok: false,
      reason: "missing",
    });
  });

  it("rejects 65 ASCII characters after normalization", () => {
    const input = "a".repeat(AMENITY_CODE_MAX_LENGTH + 1);
    assert.equal(input.length, AMENITY_CODE_MAX_LENGTH + 1);
    assert.deepEqual(normalizeAmenityCode(input), {
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts exactly AMENITY_CODE_MAX_LENGTH ASCII characters after uppercase", () => {
    const input = "a".repeat(AMENITY_CODE_MAX_LENGTH);
    assert.deepEqual(normalizeAmenityCode(input), {
      ok: true,
      code: "A".repeat(AMENITY_CODE_MAX_LENGTH),
    });
  });

  it("rejects ß×max because uppercase expands to SS (2×max chars)", () => {
    const input = "ß".repeat(AMENITY_CODE_MAX_LENGTH);
    assert.equal(input.length, AMENITY_CODE_MAX_LENGTH);
    assert.equal(input.toUpperCase().length, AMENITY_CODE_MAX_LENGTH * 2);
    assert.deepEqual(normalizeAmenityCode(input), {
      ok: false,
      reason: "too_long",
    });
  });
});
