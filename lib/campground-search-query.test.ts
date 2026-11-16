import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCampgroundSearchParams,
  campgroundSearchKey,
  clearedCampgroundQueryState,
  hookupsKey,
  siteFiltersKey,
  withLatestCampgroundFilters,
} from "./campground-search-query";

const base = {
  q: "lake",
  sort: "name" as const,
  province: "BC",
  lat: 49.28,
  lng: -123.12,
  radiusKm: 50 as const,
  amps: [30 as const, "none" as const],
  water: false,
  sewer: true,
  dumpStation: true,
  drivewayType: "PULL_THROUGH" as const,
  rigLength: 35,
  stayKind: "camping" as const,
  siteTypes: ["TENT" as const, "RV" as const],
  maxPrice: 80,
  amenityCodes: ["WIFI", "PET_FRIENDLY"],
};

describe("withLatestCampgroundFilters", () => {
  it("preserves site filters when only sort changes", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "city",
    });
    assert.equal(next.sort, "city");
    assert.deepEqual(next.amps, [30, "none"]);
    assert.equal(next.water, false);
    assert.equal(next.sewer, true);
    assert.equal(next.dumpStation, true);
    assert.equal(next.drivewayType, "PULL_THROUGH");
    assert.equal(next.rigLength, 35);
    assert.equal(next.stayKind, "camping");
    assert.equal(next.province, "BC");
  });

  it("clears driveway when switching to lodging but keeps rigLength URL state", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
    });
    assert.equal(next.stayKind, "lodging");
    // Length URL state survives lodging (like unit); RPC ignores it.
    assert.equal(next.rigLength, 35);
    assert.equal(next.drivewayType, undefined);
  });

  it("allows toggling dump station", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      dumpStation: false,
    });
    assert.equal(next.dumpStation, false);
  });
});

describe("buildCampgroundSearchParams / clear", () => {
  it("emits dump, driveway, rigLength, stay, types, maxPrice, amenities", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("q"), "lake");
    assert.equal(params.get("province"), "BC");
    assert.equal(params.get("amps"), "none,30");
    assert.equal(params.get("sewer"), "1");
    assert.equal(params.get("dump"), "1");
    assert.equal(params.get("driveway"), "pull_through");
    assert.equal(params.get("rigLength"), "35");
    // base fixture has no rigUnit → omitted until the guest sets a unit.
    assert.equal(params.get("rigUnit"), null);
    assert.equal(params.get("stay"), "camping");
    assert.equal(params.get("types"), "tent,rv");
    assert.equal(params.get("maxPrice"), "80");
    // maxPrice implies currency scope (default CAD).
    assert.equal(params.get("currency"), "CAD");
    assert.equal(params.get("amenities"), "pet_friendly,wifi");
  });

  it("emits currency with maxPrice; price sort alone does not scope", () => {
    const usd = buildCampgroundSearchParams({
      ...base,
      maxPrice: 60,
      priceCurrency: "USD",
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(usd.get("currency"), "USD");
    assert.equal(usd.get("maxPrice"), "60");

    const priceSort = buildCampgroundSearchParams({
      q: "",
      sort: "price",
      province: "",
      amps: [],
      water: false,
      sewer: false,
      dumpStation: false,
      siteTypes: [],
      amenityCodes: [],
    });
    assert.equal(priceSort.get("currency"), null);
    assert.equal(priceSort.get("sort"), "price");
  });

  it("allows toggling amenity codes", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      amenityCodes: ["POOL"],
    });
    assert.deepEqual(next.amenityCodes, ["POOL"]);
  });

  it("emits rigUnit=m when metres selected (rigLength stays feet)", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      rigUnit: "m",
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("rigLength"), "35");
    assert.equal(params.get("rigUnit"), "m");
  });

  it("emits rigUnit=ft when feet selected (explicit, not omit)", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      rigUnit: "ft",
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("rigUnit"), "ft");
  });

  it("keeps rigLength and rigUnit through lodging in the URL", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      stayKind: "lodging",
      rigUnit: "m",
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("stay"), "lodging");
    assert.equal(params.get("rigLength"), "35");
    assert.equal(params.get("rigUnit"), "m");
  });

  it("restores rigUnit and rigLength after camping → lodging → camping", () => {
    const lodging = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
      rigUnit: "m",
    });
    assert.equal(lodging.rigLength, 35);
    assert.equal(lodging.rigUnit, "m");
    const back = withLatestCampgroundFilters(lodging, {
      q: "lake",
      sort: "name",
      stayKind: "camping",
    });
    assert.equal(back.rigUnit, "m");
    assert.equal(back.rigLength, 35);
    assert.equal(buildCampgroundSearchParams(back).get("rigUnit"), "m");
  });

  it("Clear removes filters and geo", () => {
    const params = buildCampgroundSearchParams(clearedCampgroundQueryState());
    assert.equal(params.toString(), "");
  });

  it("emits empty rigLength when explicitly cleared (suppress profile default)", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      rigLength: null,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("rigLength"), "");
    assert.equal(params.has("rigLength"), true);
  });

  it("keeps omit when length equals profile default (no materialize)", () => {
    const withDefaultOmit = withLatestCampgroundFilters(
      { ...base, rigLength: undefined, water: false },
      { q: "lake", sort: "name", water: true, rigLength: undefined },
    );
    assert.equal(withDefaultOmit.rigLength, undefined);
    assert.equal(withDefaultOmit.water, true);
    const params = buildCampgroundSearchParams({
      ...withDefaultOmit,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("rigLength"), null);
    assert.equal(params.get("water"), "1");
  });

  it("keeps explicit clear through lodging round trip", () => {
    const lodging = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
      rigLength: null,
      rigUnit: "m",
    });
    assert.equal(lodging.rigLength, null);
    assert.equal(lodging.rigUnit, "m");
    const params = buildCampgroundSearchParams({
      ...lodging,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("rigLength"), "");
    assert.equal(params.get("rigUnit"), "m");
    const back = withLatestCampgroundFilters(lodging, {
      q: "lake",
      sort: "name",
      stayKind: "camping",
    });
    assert.equal(back.rigLength, null);
  });

  it("emits place only with active geo", () => {
    const withGeo = buildCampgroundSearchParams({
      ...base,
      q: "",
      place: "Québec, Canada",
    });
    assert.equal(withGeo.get("place"), "Québec, Canada");
    assert.equal(withGeo.get("lat"), "49.28");
    const withoutGeo = buildCampgroundSearchParams({
      ...base,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
      place: "Québec, Canada",
    });
    assert.equal(withoutGeo.get("place"), null);
  });

  it("campgroundSearchKey ignores sort and place label", () => {
    assert.equal(
      campgroundSearchKey({
        q: "lake",
        province: "BC",
        lat: 49.28,
        lng: -123.12,
        radiusKm: 50,
        siteFiltersKey: "water=1",
      }),
      "lake|BC|49.28,-123.12,50|water=1",
    );
  });

  it("siteFiltersKey is stable for comparisons", () => {
    assert.equal(
      siteFiltersKey({
        amps: ["none", 30],
        water: false,
        sewer: true,
        dumpStation: true,
        drivewayType: "BACK_IN",
        rigLength: 28,
        stayKind: "camping",
        siteTypes: ["TENT"],
        maxPrice: 60,
        amenityCodes: ["WIFI", "POOL"],
      }),
      "none,30|0|1|1|BACK_IN|28|camping|tent|60||pool,wifi",
    );
    assert.equal(
      hookupsKey({ amps: [], water: false, sewer: false }),
      "|0|0",
    );
  });

  it("clears camping site types when switching to lodging", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
    });
    assert.deepEqual(next.siteTypes, []);
  });

  it("clears driveway when fine types become lodging-only; keeps rigLength", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      siteTypes: ["LODGING"],
      stayKind: undefined,
    });
    assert.deepEqual(next.siteTypes, ["LODGING"]);
    assert.equal(next.rigLength, 35);
    assert.equal(next.drivewayType, undefined);
  });
});
