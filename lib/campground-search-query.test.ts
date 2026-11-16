import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCampgroundSearchParams,
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
  it("emits dump, driveway, rigLength, stay", () => {
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

  it("omits rigLength and rigUnit when lodging", () => {
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
    assert.equal(params.get("rigUnit"), null);
  });

  it("Clear removes filters and geo", () => {
    const params = buildCampgroundSearchParams(clearedCampgroundQueryState());
    assert.equal(params.toString(), "");
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
      }),
      "none,30|0|1|1|BACK_IN|28|camping",
    );
    assert.equal(
      hookupsKey({ amps: [], water: false, sewer: false }),
      "|0|0",
    );
  });
});
