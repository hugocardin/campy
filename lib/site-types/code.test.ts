import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatProtectedSiteTypeCodes,
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

  it("accepts exactly SITE_TYPE_CODE_MAX_LENGTH ASCII letters after uppercase", () => {
    const input = "a".repeat(SITE_TYPE_CODE_MAX_LENGTH);
    assert.deepEqual(normalizeSiteTypeCode(input), {
      ok: true,
      code: "A".repeat(SITE_TYPE_CODE_MAX_LENGTH),
    });
  });

  it("rejects spaces, commas, and other non-identifier characters", () => {
    assert.deepEqual(normalizeSiteTypeCode("RV, TENT"), {
      ok: false,
      reason: "invalid_format",
    });
    assert.deepEqual(normalizeSiteTypeCode("my type"), {
      ok: false,
      reason: "invalid_format",
    });
    assert.deepEqual(normalizeSiteTypeCode("1TENT"), {
      ok: false,
      reason: "invalid_format",
    });
    assert.deepEqual(normalizeSiteTypeCode("_TENT"), {
      ok: false,
      reason: "invalid_format",
    });
  });

  it("accepts underscores and digits after the leading letter", () => {
    assert.deepEqual(normalizeSiteTypeCode("rv_and_tent"), {
      ok: true,
      code: "RV_AND_TENT",
    });
    assert.deepEqual(normalizeSiteTypeCode("type2"), {
      ok: true,
      code: "TYPE2",
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

describe("formatProtectedSiteTypeCodes", () => {
  it("joins SITE_TYPE_CODES for i18n interpolation", () => {
    assert.equal(
      formatProtectedSiteTypeCodes(),
      "TENT, RV, RV_AND_TENT, LODGING",
    );
  });
});
