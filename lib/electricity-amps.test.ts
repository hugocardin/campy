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
  parseElectricityAmpsInput,
  unionElectricityAmps,
} from "./electricity-amps";

describe("electricity amps helpers", () => {
  it("exposes the fixed amp list", () => {
    assert.deepEqual([...ELECTRICITY_AMP_VALUES], [15, 20, 30, 50]);
  });

  it("parses only allowed plain integer amps", () => {
    assert.equal(parseElectricityAmp(30), 30);
    assert.equal(parseElectricityAmp("50"), 50);
    assert.equal(parseElectricityAmp(25), undefined);
    assert.equal(parseElectricityAmp(15.5), undefined);
    assert.equal(parseElectricityAmp("0x1e"), undefined);
    assert.equal(parseElectricityAmp("3e1"), undefined);
    assert.equal(parseElectricityAmp("30.0"), undefined);
  });

  it("normalizes site amps with dedupe and fixed order", () => {
    assert.deepEqual(normalizeElectricityAmps([50, 15, 15, 99, "20"]), [
      15,
      20,
      50,
    ]);
    assert.deepEqual(normalizeElectricityAmps([]), []);
  });

  it("strictly validates admin amp writes", () => {
    assert.deepEqual(parseElectricityAmpsInput([]), { ok: true, amps: [] });
    assert.deepEqual(parseElectricityAmpsInput([50, 15]), {
      ok: true,
      amps: [15, 50],
    });
    assert.equal(parseElectricityAmpsInput(undefined).ok, false);
    assert.equal(parseElectricityAmpsInput([25]).ok, false);
    assert.equal(parseElectricityAmpsInput([15, 15]).ok, false);
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

  it("formats display amp numbers without unit", () => {
    assert.equal(formatElectricityAmps([50, 15]), "15 / 50");
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
