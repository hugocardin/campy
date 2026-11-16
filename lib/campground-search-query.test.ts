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

  it("clears rig length and driveway when switching to lodging", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
    });
    assert.equal(next.stayKind, "lodging");
    assert.equal(next.rigLength, undefined);
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
  it("emits dump, driveway, rigLength, stay, types, maxPrice", () => {
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
    assert.equal(params.get("rigUnit"), null);
    assert.equal(params.get("stay"), "camping");
    assert.equal(params.get("types"), "tent,rv");
    assert.equal(params.get("maxPrice"), "80");
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

  it("omits rigLength when lodging but keeps rigUnit", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      stayKind: "lodging",
      rigUnit: "m",
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("stay"), "lodging");
    assert.equal(params.get("rigLength"), null);
    assert.equal(params.get("rigUnit"), "m");
  });

  it("restores rigUnit after camping → lodging → camping", () => {
    const lodging = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      stayKind: "lodging",
      rigUnit: "m",
    });
    assert.equal(lodging.rigLength, undefined);
    assert.equal(lodging.rigUnit, "m");
    const back = withLatestCampgroundFilters(lodging, {
      q: "lake",
      sort: "name",
      stayKind: "camping",
      rigLength: 35,
    });
    assert.equal(back.rigUnit, "m");
    assert.equal(back.rigLength, 35);
    assert.equal(buildCampgroundSearchParams(back).get("rigUnit"), "m");
  });

  it("Clear removes filters and geo", () => {
    const params = buildCampgroundSearchParams(clearedCampgroundQueryState());
    assert.equal(params.toString(), "");
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
      }),
      "none,30|0|1|1|BACK_IN|28|camping|tent|60",
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

  it("clears rig/driveway when fine types become lodging-only", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      siteTypes: ["LODGING"],
      stayKind: undefined,
    });
    assert.deepEqual(next.siteTypes, ["LODGING"]);
    assert.equal(next.rigLength, undefined);
    assert.equal(next.drivewayType, undefined);
  });
});
