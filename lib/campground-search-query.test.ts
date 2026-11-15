import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCampgroundSearchParams,
  clearedCampgroundQueryState,
  hookupsKey,
  withLatestCampgroundFilters,
} from "./campground-search-query";

const base = {
  q: "lake",
  sort: "name" as const,
  province: "BC",
  lat: 49.28,
  lng: -123.12,
  radiusKm: 50 as const,
  electricity: true,
  water: false,
  sewer: true,
};

describe("withLatestCampgroundFilters", () => {
  it("preserves hookups when only sort changes", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "city",
    });
    assert.equal(next.sort, "city");
    assert.equal(next.electricity, true);
    assert.equal(next.water, false);
    assert.equal(next.sewer, true);
    assert.equal(next.province, "BC");
  });

  it("preserves hookups across near-me geo patch", () => {
    const next = withLatestCampgroundFilters(
      { ...base, lat: undefined, lng: undefined, radiusKm: undefined },
      {
        q: "lake",
        sort: "distance",
        lat: 49.28,
        lng: -123.12,
        radiusKm: 50,
      },
    );
    assert.equal(next.sort, "distance");
    assert.equal(next.electricity, true);
    assert.equal(next.sewer, true);
    assert.equal(next.lat, 49.28);
  });

  it("allows toggling a single hookup flag", () => {
    const next = withLatestCampgroundFilters(base, {
      q: "lake",
      sort: "name",
      water: true,
    });
    assert.deepEqual(
      { electricity: next.electricity, water: next.water, sewer: next.sewer },
      { electricity: true, water: true, sewer: true },
    );
  });
});

describe("buildCampgroundSearchParams / clear", () => {
  it("emits electricity=1&sewer=1 and omits water", () => {
    const params = buildCampgroundSearchParams({
      ...base,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
    });
    assert.equal(params.get("q"), "lake");
    assert.equal(params.get("province"), "BC");
    assert.equal(params.get("electricity"), "1");
    assert.equal(params.get("water"), null);
    assert.equal(params.get("sewer"), "1");
    assert.equal(params.get("sort"), null);
  });

  it("Clear removes hookups and geo", () => {
    const params = buildCampgroundSearchParams(clearedCampgroundQueryState());
    assert.equal(params.toString(), "");
  });

  it("hookupsKey is stable for comparisons", () => {
    assert.equal(hookupsKey({ electricity: true, water: false, sewer: true }), "101");
    assert.equal(hookupsKey({ electricity: false, water: false, sewer: false }), "000");
  });
});
