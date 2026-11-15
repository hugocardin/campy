import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  campgroundRadiusMeters,
  campgroundSortQueryValue,
  formatDistanceKm,
  parseCampgroundGeo,
  parseCampgroundRadiusKm,
  parseCampgroundSort,
  roundCampgroundCoord,
  sanitizeCampgroundSearchTerm,
  validateCampgroundGeo,
} from "./campground-search";

describe("parseCampgroundSort", () => {
  it("accepts known sorts and defaults otherwise", () => {
    assert.equal(parseCampgroundSort("city"), "city");
    assert.equal(parseCampgroundSort("name-desc"), "name-desc");
    assert.equal(parseCampgroundSort(undefined), "name");
    assert.equal(parseCampgroundSort("nope"), "name");
  });

  it("defaults to distance when geo is active", () => {
    assert.equal(parseCampgroundSort(undefined, { geoActive: true }), "distance");
    assert.equal(parseCampgroundSort("distance", { geoActive: true }), "distance");
    assert.equal(parseCampgroundSort("distance", { geoActive: false }), "name");
    assert.equal(parseCampgroundSort("name", { geoActive: true }), "name");
  });
});

describe("campgroundSortQueryValue", () => {
  it("omits only the mode default so geo+name round-trips", () => {
    assert.equal(campgroundSortQueryValue("distance", true), undefined);
    assert.equal(campgroundSortQueryValue("name", true), "name");
    assert.equal(campgroundSortQueryValue("name", false), undefined);
    assert.equal(campgroundSortQueryValue("distance", false), "distance");
    assert.equal(campgroundSortQueryValue("city", true), "city");

    assert.equal(
      parseCampgroundSort(campgroundSortQueryValue("name", true), {
        geoActive: true,
      }),
      "name",
    );
    assert.equal(
      parseCampgroundSort(campgroundSortQueryValue("distance", true), {
        geoActive: true,
      }),
      "distance",
    );
  });
});

describe("sanitizeCampgroundSearchTerm", () => {
  it("strips PostgREST / ilike breakers and wildcards", () => {
    assert.equal(sanitizeCampgroundSearchTerm("  St. John's  "), "St. John's");
    assert.equal(sanitizeCampgroundSearchTerm("a%b_c*d"), "a b c d");
    assert.equal(sanitizeCampgroundSearchTerm('x(y),z\\"'), "x y z");
  });
});

describe("parseCampgroundRadiusKm", () => {
  it("only accepts presets", () => {
    for (const km of CAMPGROUND_RADIUS_KM_PRESETS) {
      assert.equal(parseCampgroundRadiusKm(String(km)), km);
    }
    assert.equal(parseCampgroundRadiusKm("30"), undefined);
    assert.equal(parseCampgroundRadiusKm(undefined), undefined);
    assert.equal(DEFAULT_CAMPGROUND_RADIUS_KM, 50);
  });
});

describe("roundCampgroundCoord", () => {
  it("rounds to ~1 km privacy decimals", () => {
    assert.equal(roundCampgroundCoord(49.282711), 49.28);
    assert.equal(roundCampgroundCoord(-123.120735), -123.12);
  });
});

describe("validateCampgroundGeo / parseCampgroundGeo", () => {
  it("requires valid lat, lng, and radiusKm together and rounds", () => {
    assert.deepEqual(
      validateCampgroundGeo(49.2827, -123.1207, 50),
      { lat: 49.28, lng: -123.12, radiusKm: 50 },
    );
    assert.deepEqual(
      parseCampgroundGeo({ lat: "49.2827", lng: "-123.1207", radiusKm: "50" }),
      { lat: 49.28, lng: -123.12, radiusKm: 50 },
    );
    assert.equal(
      parseCampgroundGeo({ lat: "49.28", lng: "-123.12" }),
      undefined,
    );
    assert.equal(
      parseCampgroundGeo({ lat: "0", lng: "0", radiusKm: "25" }),
      undefined,
    );
    assert.equal(
      parseCampgroundGeo({ lat: "91", lng: "0", radiusKm: "25" }),
      undefined,
    );
    assert.equal(
      parseCampgroundGeo({ lat: "abc", lng: "-123", radiusKm: "50" }),
      undefined,
    );
    assert.equal(validateCampgroundGeo(49.28, -123.12, 30), undefined);
  });
});

describe("campgroundRadiusMeters", () => {
  it("converts km to meters", () => {
    assert.equal(campgroundRadiusMeters(25), 25000);
    assert.equal(campgroundRadiusMeters(100), 100000);
  });
});

describe("formatDistanceKm", () => {
  it("formats metres as whole km labels", () => {
    assert.equal(formatDistanceKm(500), "<1");
    assert.equal(formatDistanceKm(1200), "1");
    assert.equal(formatDistanceKm(12500), "13");
    assert.equal(formatDistanceKm(null), null);
  });
});
