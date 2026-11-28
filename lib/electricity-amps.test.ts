import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELECTRICITY_AMP_15_20,
  ELECTRICITY_AMP_LEGACY_20,
  ELECTRICITY_AMP_NONE,
  ELECTRICITY_AMP_NONE_RPC,
  ELECTRICITY_AMP_SUMMARY_JOINER,
  ELECTRICITY_AMP_VALUES,
  electricityAmpsToRpcArg,
  formatElectricityAmpsWithLabels,
  normalizeElectricityAmpFilters,
  normalizeElectricityAmps,
  parseElectricityAmp,
  parseElectricityAmpsInput,
  remapLegacyAmp,
  unionElectricityAmps,
} from "./electricity-amps";

describe("electricity amps helpers", () => {
  it("exposes the fixed amp list (15 = combined 15/20A tier)", () => {
    assert.deepEqual([...ELECTRICITY_AMP_VALUES], [15, 30, 50]);
    assert.equal(ELECTRICITY_AMP_15_20, 15);
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

  it("remaps legacy 20 to the combined 15/20A tier", () => {
    assert.equal(remapLegacyAmp(ELECTRICITY_AMP_LEGACY_20), ELECTRICITY_AMP_15_20);
    assert.equal(parseElectricityAmp(ELECTRICITY_AMP_LEGACY_20), 15);
    assert.equal(parseElectricityAmp("20"), 15);
    assert.deepEqual(normalizeElectricityAmps([50, 20, 15]), [15, 50]);
  });

  it("normalizes site amps with dedupe and fixed order", () => {
    assert.deepEqual(normalizeElectricityAmps([50, 15, 15, 99, "30"]), [
      15,
      30,
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
    assert.deepEqual(parseElectricityAmpsInput([20]), {
      ok: true,
      amps: [15],
    });
    assert.equal(parseElectricityAmpsInput(undefined).ok, false);
    assert.equal(parseElectricityAmpsInput([25]).ok, false);
    assert.equal(parseElectricityAmpsInput([15, 15]).ok, false);
    assert.equal(parseElectricityAmpsInput([15, 20]).ok, false);
  });

  it("normalizes guest filter options including none and legacy 20", () => {
    assert.deepEqual(
      normalizeElectricityAmpFilters(["30", ELECTRICITY_AMP_NONE, 15, "none"]),
      [ELECTRICITY_AMP_NONE, 15, 30],
    );
    assert.deepEqual(normalizeElectricityAmpFilters([0, "0"]), [
      ELECTRICITY_AMP_NONE,
    ]);
    assert.deepEqual(normalizeElectricityAmpFilters([20, "20", 30]), [15, 30]);
  });

  it("joins localized outlet labels with configurable joiner", () => {
    assert.equal(
      formatElectricityAmpsWithLabels([50, 15], (amp) =>
        amp === 15 ? "15/20 A" : `${amp} A`,
      ),
      "15/20 A + 50 A",
    );
    assert.equal(
      formatElectricityAmpsWithLabels(
        [50, 15, 30],
        (amp) => (amp === 15 ? "15/20 A" : `${amp} A`),
        ELECTRICITY_AMP_SUMMARY_JOINER,
      ),
      "15/20 A, 30 A, 50 A",
    );
    assert.equal(formatElectricityAmpsWithLabels([], () => "x"), null);
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
    assert.deepEqual(electricityAmpsToRpcArg([15, 30, 50]), [15, 30, 50]);
    assert.deepEqual(
      electricityAmpsToRpcArg(normalizeElectricityAmpFilters([15, 20, 30, 50])),
      [15, 30, 50],
    );
  });
});
