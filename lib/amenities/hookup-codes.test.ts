import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROTECTED_HOOKUP_AMENITY_CODES,
  isProtectedHookupAmenityCode,
} from "./hookup-codes";

describe("protected hookup amenity codes", () => {
  it("lists ELECTRICITY WATER SEWER", () => {
    assert.deepEqual([...PROTECTED_HOOKUP_AMENITY_CODES], [
      "ELECTRICITY",
      "WATER",
      "SEWER",
    ]);
  });

  it("matches case-insensitively after trim", () => {
    assert.equal(isProtectedHookupAmenityCode(" electricity "), true);
    assert.equal(isProtectedHookupAmenityCode("WIFI"), false);
  });
});
