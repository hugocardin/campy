import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLodgingSiteType,
  parseGuestRigLength,
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

  it("parses guest rig length", () => {
    assert.equal(parseGuestRigLength("35"), 35);
    assert.equal(parseGuestRigLength(28.5), 28.5);
    assert.equal(parseGuestRigLength("0"), undefined);
    assert.equal(parseGuestRigLength("-1"), undefined);
    assert.equal(parseGuestRigLength("abc"), undefined);
    assert.equal(parseGuestRigLength("999"), undefined);
  });
});
