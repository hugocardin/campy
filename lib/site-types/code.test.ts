import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isProtectedSiteTypeCode,
  normalizeSiteTypeCode,
  SITE_TYPE_CODE_MAX_LENGTH,
} from "./code";

describe("normalizeSiteTypeCode", () => {
  it("trims and uppercases a valid code", () => {
    assert.deepEqual(normalizeSiteTypeCode("  tent "), {
      ok: true,
      code: "TENT",
    });
  });

  it("rejects empty / whitespace-only / non-string input", () => {
    assert.deepEqual(normalizeSiteTypeCode(""), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeSiteTypeCode("   "), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeSiteTypeCode(null), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(normalizeSiteTypeCode(42), {
      ok: false,
      reason: "missing",
    });
  });

  it("rejects codes longer than the cap after uppercase", () => {
    const tooLong = "a".repeat(SITE_TYPE_CODE_MAX_LENGTH + 1);
    assert.deepEqual(normalizeSiteTypeCode(tooLong), {
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts exactly SITE_TYPE_CODE_MAX_LENGTH ASCII characters after uppercase", () => {
    const input = "a".repeat(SITE_TYPE_CODE_MAX_LENGTH);
    assert.deepEqual(normalizeSiteTypeCode(input), {
      ok: true,
      code: "A".repeat(SITE_TYPE_CODE_MAX_LENGTH),
    });
  });
});

describe("isProtectedSiteTypeCode", () => {
  it("protects seeded system codes", () => {
    assert.equal(isProtectedSiteTypeCode("TENT"), true);
    assert.equal(isProtectedSiteTypeCode(" rv "), true);
    assert.equal(isProtectedSiteTypeCode("RV_AND_TENT"), true);
    assert.equal(isProtectedSiteTypeCode("lodging"), true);
  });

  it("allows custom codes", () => {
    assert.equal(isProtectedSiteTypeCode("CABIN"), false);
    assert.equal(isProtectedSiteTypeCode(""), false);
    assert.equal(isProtectedSiteTypeCode(null), false);
  });
});
