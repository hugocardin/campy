import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amenityCodeCanonicalKey,
  formatGuestAmenityCodesParam,
  guestSearchAmenityCatalog,
  isExcludedGuestSearchAmenity,
  isGuestSearchAmenityCode,
  normalizeGuestAmenityCodes,
  parseGuestAmenityCodes,
} from "./guest-amenity-codes";

describe("amenityCodeCanonicalKey", () => {
  it("maps spaced DB codes to underscore keys", () => {
    assert.equal(amenityCodeCanonicalKey("PET FRIENDLY"), "PET_FRIENDLY");
    assert.equal(amenityCodeCanonicalKey("fire pit"), "FIRE_PIT");
    assert.equal(amenityCodeCanonicalKey("WIFI"), "WIFI");
  });
});

describe("excluded / guest-search amenity codes", () => {
  it("excludes dedicated hookup and dump codes", () => {
    assert.equal(isExcludedGuestSearchAmenity("WATER"), true);
    assert.equal(isExcludedGuestSearchAmenity("sewer"), true);
    assert.equal(isExcludedGuestSearchAmenity("DUMP_STATION"), true);
    assert.equal(isExcludedGuestSearchAmenity("ELECTRICITY"), true);
    assert.equal(isGuestSearchAmenityCode("WIFI"), true);
    assert.equal(isGuestSearchAmenityCode("PET FRIENDLY"), true);
    assert.equal(isGuestSearchAmenityCode("WATER"), false);
  });
});

describe("parseGuestAmenityCodes / format", () => {
  it("parses comma tokens, dedupes, sorts, lowercases for URL", () => {
    assert.deepEqual(parseGuestAmenityCodes("pool,wifi,pool"), [
      "POOL",
      "WIFI",
    ]);
    assert.deepEqual(parseGuestAmenityCodes("pet_friendly,FIRE_PIT"), [
      "FIRE_PIT",
      "PET_FRIENDLY",
    ]);
    assert.equal(
      formatGuestAmenityCodesParam(["WIFI", "PET FRIENDLY"]),
      "pet_friendly,wifi",
    );
    assert.equal(formatGuestAmenityCodesParam([]), undefined);
  });

  it("drops excluded and empty tokens", () => {
    assert.deepEqual(parseGuestAmenityCodes("wifi,water,dump_station,"), [
      "WIFI",
    ]);
    assert.deepEqual(normalizeGuestAmenityCodes(["", "  ", "SEWER"]), []);
  });
});

describe("guestSearchAmenityCatalog", () => {
  it("filters catalog rows for guest checkboxes", () => {
    const rows = [
      { code: "WIFI" },
      { code: "WATER" },
      { code: "DUMP_STATION" },
      { code: "PET FRIENDLY" },
    ];
    assert.deepEqual(guestSearchAmenityCatalog(rows), [
      { code: "WIFI" },
      { code: "PET FRIENDLY" },
    ]);
  });
});
