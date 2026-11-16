import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RIG_LENGTH_MAX_FT,
  RIG_LENGTH_MAX_M,
  convertRigLengthDisplay,
  formatGuestRigLengthParam,
  formatRigLength,
  formatRigLengthForDisplay,
  formatRigLengthUnitParam,
  isLodgingSiteType,
  metresToFeet,
  parseGuestRigLength,
  parseRigLengthToFeet,
  parseRigLengthUnit,
  siteTypeRequiresMaxRigLength,
} from "./site-rig-length";

describe("site-rig-length", () => {
  it("classifies site types", () => {
    assert.equal(isLodgingSiteType("LODGING"), true);
    assert.equal(isLodgingSiteType("RV"), false);
    assert.equal(siteTypeRequiresMaxRigLength("RV"), true);
    assert.equal(siteTypeRequiresMaxRigLength("RV_AND_TENT"), true);
    assert.equal(siteTypeRequiresMaxRigLength("TENT"), false);
    assert.equal(siteTypeRequiresMaxRigLength("LODGING"), false);
  });

  it("derives metre max from feet so conversion never exceeds the feet cap", () => {
    assert.equal(RIG_LENGTH_MAX_M, 60.96);
    assert.ok(metresToFeet(RIG_LENGTH_MAX_M) <= RIG_LENGTH_MAX_FT + 1e-9);
  });

  it("parses guest rig length in feet (default)", () => {
    assert.equal(parseGuestRigLength("35"), 35);
    assert.equal(parseGuestRigLength(28.5), 28.5);
    assert.equal(parseGuestRigLength("0"), undefined);
    assert.equal(parseGuestRigLength("-1"), undefined);
    assert.equal(parseGuestRigLength("abc"), undefined);
    assert.equal(parseGuestRigLength("999"), undefined);
    assert.equal(parseGuestRigLength(String(RIG_LENGTH_MAX_FT)), RIG_LENGTH_MAX_FT);
    assert.equal(parseGuestRigLength(String(RIG_LENGTH_MAX_FT + 1)), undefined);
  });

  it("parses metres after converting, with a feet cap", () => {
    const feet = parseGuestRigLength("10", "m");
    assert.ok(feet != null);
    assert.equal(feet, Math.round(metresToFeet(10) * 10) / 10);
    const atMax = parseGuestRigLength(String(RIG_LENGTH_MAX_M), "m");
    assert.ok(atMax != null);
    assert.equal(atMax, RIG_LENGTH_MAX_FT);
    // Round-trip through feet (server / URL default unit).
    assert.equal(parseGuestRigLength(String(atMax)), atMax);
    // Hard-coded 61 m used to exceed 200 ft after conversion.
    assert.equal(parseGuestRigLength("61", "m"), undefined);
    assert.equal(parseGuestRigLength("62", "m"), undefined);
  });

  it("keeps ft→m→ft round-trip from excluding equal-length sites", () => {
    const displayM = formatRigLengthForDisplay(35, "m");
    assert.equal(displayM, "10.67");
    const back = parseGuestRigLength(displayM, "m");
    assert.equal(back, 35);
    assert.ok(back != null && back <= 35);
  });

  it("distinguishes empty / invalid / over_max for admin", () => {
    assert.deepEqual(parseRigLengthToFeet(""), { ok: false, reason: "empty" });
    assert.deepEqual(parseRigLengthToFeet("abc"), {
      ok: false,
      reason: "invalid",
    });
    assert.deepEqual(parseRigLengthToFeet("250"), {
      ok: false,
      reason: "over_max",
    });
    assert.deepEqual(parseRigLengthToFeet("35"), { ok: true, feet: 35 });
  });

  it("accepts a single locale decimal comma and rejects mixed separators", () => {
    assert.deepEqual(parseRigLengthToFeet("10,67", "m"), {
      ok: true,
      feet: 35,
    });
    assert.deepEqual(parseRigLengthToFeet("1,2,3", "m"), {
      ok: false,
      reason: "invalid",
    });
    assert.deepEqual(parseRigLengthToFeet("10.67,1", "m"), {
      ok: false,
      reason: "invalid",
    });
    assert.equal(formatRigLengthForDisplay(35, "m", "fr-CA"), "10,67");
    assert.equal(formatRigLengthForDisplay(35, "m", "en-CA"), "10.67");
  });

  it("rejects tiny positives that round to 0 ft", () => {
    assert.deepEqual(parseRigLengthToFeet("0.04"), {
      ok: false,
      reason: "invalid",
    });
    assert.deepEqual(parseRigLengthToFeet("0.01", "m"), {
      ok: false,
      reason: "invalid",
    });
    assert.equal(parseGuestRigLength("0.04"), undefined);
    assert.equal(parseGuestRigLength(0.04), undefined);
  });

  it("parses and formats rigUnit URL values", () => {
    assert.equal(parseRigLengthUnit(undefined), "ft");
    assert.equal(parseRigLengthUnit("ft"), "ft");
    assert.equal(parseRigLengthUnit("m"), "m");
    assert.equal(parseRigLengthUnit("metre"), "m");
    assert.equal(parseRigLengthUnit("METERS"), "m");
    assert.equal(formatRigLengthUnitParam("ft"), undefined);
    assert.equal(formatRigLengthUnitParam(undefined), undefined);
    assert.equal(formatRigLengthUnitParam("m"), "m");
  });

  it("converts display values and formats drafts from feet", () => {
    assert.equal(convertRigLengthDisplay(35, "ft", "m"), 10.67);
    assert.equal(convertRigLengthDisplay(10.67, "m", "ft"), 35);
    assert.equal(formatRigLengthForDisplay(35, "ft"), "35");
    assert.equal(formatRigLengthForDisplay(35, "m"), "10.67");
    assert.equal(formatRigLengthForDisplay(undefined, "m"), "");
    assert.equal(formatGuestRigLengthParam(35), "35");
    assert.equal(formatGuestRigLengthParam(35.12), "35.1");
  });

  it("formats dual ft/m for site cards (locale + 2-decimal metres)", () => {
    const en = { ft: "ft", m: "m" };
    const fr = { ft: "pi", m: "m" };
    // 11 m stored as 36.1 ft (1-decimal metres→feet).
    assert.equal(
      formatRigLength(36.1, { labels: en, locale: "en-CA" }),
      "36.1 ft (11 m)",
    );
    assert.equal(
      formatRigLength(36.1, { labels: fr, locale: "fr-CA" }),
      "36,1 pi (11 m)",
    );
    assert.equal(
      formatRigLength(36.1, {
        labels: en,
        locale: "en-CA",
        primaryUnit: "m",
      }),
      "11 m (36.1 ft)",
    );
    // 36 ft is 10.9728 m — 2-decimal display must not overstate as 11 m.
    assert.equal(
      formatRigLength(36, { labels: en, locale: "en-CA" }),
      "36 ft (10.97 m)",
    );
    assert.equal(
      formatRigLength(35, { labels: en, locale: "en-CA" }),
      "35 ft (10.67 m)",
    );
    assert.equal(formatRigLength(null, { labels: en }), null);
    assert.equal(formatRigLength(undefined, { labels: en }), null);
    assert.equal(formatRigLength(0, { labels: en }), null);
    assert.equal(formatRigLength(0.04, { labels: en }), null);
    assert.equal(formatRigLength(-1, { labels: en }), null);
  });
});
