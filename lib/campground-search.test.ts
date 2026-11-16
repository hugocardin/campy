import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ELECTRICITY_AMP_VALUES } from "./electricity-amps";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  HOOKUP_AMENITY_CODES,
  SEARCH_CAMPGROUNDS_LIMIT,
  SEARCH_CAMPGROUNDS_RPC_MAX,
  anyHookupFilterActive,
  anySiteFilterActive,
  campgroundRadiusMeters,
  campgroundSortQueryValue,
  formatCampgroundAmpsParam,
  formatDistanceKm,
  parseCampgroundAmps,
  parseCampgroundGeo,
  parseCampgroundHookups,
  parseCampgroundPlaceLabel,
  parseCampgroundRadiusKm,
  parseCampgroundSiteFilters,
  parseCampgroundSort,
  parseHookupFlag,
  roundCampgroundCoord,
  sanitizeCampgroundSearchTerm,
  validateCampgroundGeo,
} from "./campground-search";

describe("SEARCH_CAMPGROUNDS_LIMIT vs RPC max", () => {
  it("allows LIMIT+1 probe within the SQL clamp", () => {
    assert.ok(
      SEARCH_CAMPGROUNDS_LIMIT + 1 <= SEARCH_CAMPGROUNDS_RPC_MAX,
      `SEARCH_CAMPGROUNDS_LIMIT+1 (${SEARCH_CAMPGROUNDS_LIMIT + 1}) must be ≤ SEARCH_CAMPGROUNDS_RPC_MAX (${SEARCH_CAMPGROUNDS_RPC_MAX})`,
    );
  });
});

describe("parseCampgroundPlaceLabel", () => {
  it("trims, strips controls, and caps length", () => {
    assert.equal(parseCampgroundPlaceLabel("  Québec  "), "Québec");
    assert.equal(parseCampgroundPlaceLabel("a\u0000b"), "ab");
    assert.equal(parseCampgroundPlaceLabel(""), undefined);
    assert.equal(parseCampgroundPlaceLabel(undefined), undefined);
    assert.equal(parseCampgroundPlaceLabel("x".repeat(200))?.length, 120);
  });
});

describe("parseCampgroundSort", () => {
  it("accepts known sorts and defaults otherwise", () => {
    assert.equal(parseCampgroundSort("city"), "city");
    assert.equal(parseCampgroundSort("name-desc"), "name-desc");
    assert.equal(parseCampgroundSort("price"), "price");
    assert.equal(parseCampgroundSort("price-desc"), "price-desc");
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

describe("hookup URL filters", () => {
  it("maps stable water/sewer amenity codes", () => {
    assert.equal(HOOKUP_AMENITY_CODES.water, "WATER");
    assert.equal(HOOKUP_AMENITY_CODES.sewer, "SEWER");
  });

  it("only treats 1 as true", () => {
    assert.equal(parseHookupFlag("1"), true);
    assert.equal(parseHookupFlag("true"), false);
    assert.equal(parseHookupFlag("yes"), false);
    assert.equal(parseHookupFlag("0"), false);
    assert.equal(parseHookupFlag(undefined), false);
  });

  it("parses amps + water/sewer URL params", () => {
    assert.deepEqual(
      parseCampgroundHookups({
        amps: "none,30",
        water: "true",
        sewer: "1",
      }),
      { amps: ["none", 30], water: false, sewer: true },
    );
    assert.equal(
      anyHookupFilterActive({ amps: [], water: false, sewer: false }),
      false,
    );
    assert.equal(
      anyHookupFilterActive({ amps: [30], water: false, sewer: false }),
      true,
    );
  });

  it("maps legacy electricity=1 to any amp when amps absent", () => {
    assert.deepEqual(parseCampgroundAmps({ electricity: "1" }), [
      ...ELECTRICITY_AMP_VALUES,
    ]);
    assert.deepEqual(
      parseCampgroundAmps({ amps: "30", electricity: "1" }),
      [30],
    );
  });

  it("serializes amps for the URL", () => {
    assert.equal(formatCampgroundAmpsParam([]), undefined);
    assert.equal(formatCampgroundAmpsParam(["none", 50, 15]), "none,15,50");
  });
});

describe("site filters (dump / driveway / rig / stay / types / price)", () => {
  it("parses dump driveway rig stay URL params", () => {
    assert.deepEqual(
      parseCampgroundSiteFilters({
        dump: "1",
        driveway: "pull_through",
        rigLength: "35",
        stay: "camping",
        water: "1",
      }),
      {
        amps: [],
        water: true,
        sewer: false,
        dumpStation: true,
        drivewayType: "PULL_THROUGH",
        rigLength: 35,
        stayKind: "camping",
        siteTypes: [],
        maxPrice: undefined,
      },
    );
  });

  it("ignores rig length and driveway when stay is lodging", () => {
    const filters = parseCampgroundSiteFilters({
      rigLength: "40",
      driveway: "pull_through",
      stay: "lodging",
    });
    assert.equal(filters.stayKind, "lodging");
    assert.equal(filters.rigLength, undefined);
    assert.equal(filters.drivewayType, undefined);
  });

  it("ignores rig length and driveway when fine types are lodging-only", () => {
    const filters = parseCampgroundSiteFilters({
      types: "lodging",
      rigLength: "40",
      driveway: "pull_through",
    });
    assert.deepEqual(filters.siteTypes, ["LODGING"]);
    assert.equal(filters.rigLength, undefined);
    assert.equal(filters.drivewayType, undefined);
  });

  it("parses fine site types and maxPrice; drops types incompatible with stay", () => {
    assert.deepEqual(
      parseCampgroundSiteFilters({
        types: "tent,rv,lodging",
        maxPrice: "75",
        stay: "camping",
      }).siteTypes,
      ["TENT", "RV"],
    );
    assert.equal(
      parseCampgroundSiteFilters({ maxPrice: "75" }).maxPrice,
      75,
    );
  });

  it("detects any site filter active", () => {
    assert.equal(
      anySiteFilterActive({
        amps: [],
        water: false,
        sewer: false,
        dumpStation: false,
        siteTypes: [],
      }),
      false,
    );
    assert.equal(
      anySiteFilterActive({
        amps: [],
        water: false,
        sewer: false,
        dumpStation: true,
        siteTypes: [],
      }),
      true,
    );
    assert.equal(
      anySiteFilterActive({
        amps: [],
        water: false,
        sewer: false,
        dumpStation: false,
        siteTypes: ["TENT"],
      }),
      true,
    );
    assert.equal(
      anySiteFilterActive({
        amps: [],
        water: false,
        sewer: false,
        dumpStation: false,
        siteTypes: [],
        maxPrice: 40,
      }),
      true,
    );
    assert.equal(
      anyHookupFilterActive({ amps: [], water: false, sewer: false }),
      false,
    );
  });
});
