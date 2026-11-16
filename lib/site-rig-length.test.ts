import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RIG_LENGTH_MAX_FT,
  RIG_LENGTH_MAX_M,
  convertRigLengthDisplay,
  formatGuestRigLengthParam,
  formatRigLengthForDisplay,
  formatRigLengthUnitParam,
  isLodgingSiteType,
  metresToFeet,
  parseGuestRigLength,
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

  it("parses guest rig length in metres and returns feet", () => {
    const feet = parseGuestRigLength("10", "m");
    assert.ok(feet != null);
    assert.equal(feet, Math.round(metresToFeet(10) * 100) / 100);
    assert.equal(parseGuestRigLength(String(RIG_LENGTH_MAX_M), "m") != null, true);
    assert.equal(parseGuestRigLength(String(RIG_LENGTH_MAX_M + 1), "m"), undefined);
    // Cap is applied in metres before conversion (61 m ok, 62 m rejected).
    assert.equal(parseGuestRigLength("62", "m"), undefined);
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
    assert.equal(formatGuestRigLengthParam(35.12), "35.12");
  });
});
