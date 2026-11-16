import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELECTRICITY_AMP_NONE,
  ELECTRICITY_AMP_NONE_RPC,
  ELECTRICITY_AMP_VALUES,
  electricityAmpsToRpcArg,
  formatElectricityAmps,
  normalizeElectricityAmpFilters,
  normalizeElectricityAmps,
  parseElectricityAmp,
  unionElectricityAmps,
} from "./electricity-amps";

describe("electricity amps helpers", () => {
  it("exposes the fixed amp list", () => {
    assert.deepEqual([...ELECTRICITY_AMP_VALUES], [15, 20, 30, 50]);
  });

  it("parses only allowed integer amps", () => {
    assert.equal(parseElectricityAmp(30), 30);
    assert.equal(parseElectricityAmp("50"), 50);
    assert.equal(parseElectricityAmp(25), undefined);
    assert.equal(parseElectricityAmp(15.5), undefined);
  });

  it("normalizes site amps with dedupe and fixed order", () => {
    assert.deepEqual(normalizeElectricityAmps([50, 15, 15, 99, "20"]), [
      15,
      20,
      50,
    ]);
    assert.deepEqual(normalizeElectricityAmps([]), []);
  });

  it("normalizes guest filter options including none", () => {
    assert.deepEqual(
      normalizeElectricityAmpFilters(["30", ELECTRICITY_AMP_NONE, 15, "none"]),
      [ELECTRICITY_AMP_NONE, 15, 30],
    );
    assert.deepEqual(normalizeElectricityAmpFilters([0, "0"]), [
      ELECTRICITY_AMP_NONE,
    ]);
  });

  it("formats display labels", () => {
    assert.equal(formatElectricityAmps([50, 15]), "15 / 50 A");
    assert.equal(formatElectricityAmps([]), null);
    assert.equal(formatElectricityAmps(null), null);
  });

  it("unions site amps for campground summary", () => {
    assert.deepEqual(unionElectricityAmps([[50], [15, 30], []]), [15, 30, 50]);
  });

  it("maps filters to RPC args (0 = none)", () => {
    assert.equal(electricityAmpsToRpcArg([]), null);
    assert.deepEqual(electricityAmpsToRpcArg([ELECTRICITY_AMP_NONE, 30]), [
      ELECTRICITY_AMP_NONE_RPC,
      30,
    ]);
    assert.deepEqual(electricityAmpsToRpcArg([15, 20, 30, 50]), [
      15,
      20,
      30,
      50,
    ]);
  });
});
