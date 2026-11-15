import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  campgroundRadiusMeters,
  parseCampgroundGeo,
  parseCampgroundRadiusKm,
  parseCampgroundSort,
  sanitizeCampgroundSearchTerm,
} from "./campground-search";

describe("parseCampgroundSort", () => {
  it("accepts known sorts and defaults otherwise", () => {
    assert.equal(parseCampgroundSort("city"), "city");
    assert.equal(parseCampgroundSort("name-desc"), "name-desc");
    assert.equal(parseCampgroundSort(undefined), "name");
    assert.equal(parseCampgroundSort("nope"), "name");
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

describe("parseCampgroundGeo", () => {
  it("requires valid lat, lng, and radiusKm together", () => {
    assert.deepEqual(
      parseCampgroundGeo({ lat: "49.28", lng: "-123.12", radiusKm: "50" }),
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
  });
});

describe("campgroundRadiusMeters", () => {
  it("converts km to meters", () => {
    assert.equal(campgroundRadiusMeters(25), 25000);
    assert.equal(campgroundRadiusMeters(100), 100000);
  });
});
