import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROTECTED_HOOKUP_AMENITY_CODES,
  isProtectedHookupAmenityCode,
} from "./hookup-codes";

describe("protected hookup amenity codes", () => {
  it("lists WATER SEWER (electricity is sites.electricity_amps)", () => {
    assert.deepEqual([...PROTECTED_HOOKUP_AMENITY_CODES], ["WATER", "SEWER"]);
  });

  it("matches case-insensitively after trim", () => {
    assert.equal(isProtectedHookupAmenityCode(" water "), true);
    assert.equal(isProtectedHookupAmenityCode("ELECTRICITY"), false);
    assert.equal(isProtectedHookupAmenityCode("WIFI"), false);
  });
});
