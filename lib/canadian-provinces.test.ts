import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  foldProvinceKey,
  isCanadianProvinceCode,
  provinceFilterKey,
  provinceMatchValues,
  provinceOrFilter,
  resolveProvinceCode,
  uniqueProvinceFilterKeys,
} from "./canadian-provinces";

describe("resolveProvinceCode", () => {
  it("maps codes and aliases including accents", () => {
    assert.equal(resolveProvinceCode("QC"), "QC");
    assert.equal(resolveProvinceCode("qc"), "QC");
    assert.equal(resolveProvinceCode("Quebec"), "QC");
    assert.equal(resolveProvinceCode("Québec"), "QC");
    assert.equal(resolveProvinceCode("  British Columbia "), "BC");
    assert.equal(resolveProvinceCode("Colombie-Britannique"), "BC");
    assert.equal(resolveProvinceCode("PEI"), "PE");
    assert.equal(resolveProvinceCode("unknown"), null);
    assert.equal(resolveProvinceCode(""), null);
  });
});

describe("provinceFilterKey / uniqueProvinceFilterKeys", () => {
  it("collapses alias variants to one code", () => {
    assert.equal(provinceFilterKey("Québec"), "QC");
    assert.deepEqual(
      uniqueProvinceFilterKeys(["QC", "Quebec", "Québec", "BC", "bc", "Weird"]),
      ["BC", "QC", "Weird"],
    );
  });
});

describe("provinceMatchValues / provinceOrFilter", () => {
  it("expands a code to aliases for DB matching", () => {
    const values = provinceMatchValues("QC");
    assert.ok(values.includes("QC"));
    assert.ok(values.includes("Quebec"));
    assert.ok(values.includes("Québec"));
    assert.equal(provinceMatchValues("Customland")[0], "Customland");
  });

  it("builds a PostgREST or filter without wildcards", () => {
    const fragment = provinceOrFilter("BC");
    assert.ok(fragment);
    assert.match(fragment!, /^province\.ilike\."BC"/);
    assert.ok(fragment!.includes('province.ilike."British Columbia"'));
    assert.ok(!fragment!.includes("%"));
  });
});

describe("foldProvinceKey / isCanadianProvinceCode", () => {
  it("folds accents and punctuation", () => {
    assert.equal(foldProvinceKey("Québec"), "quebec");
    assert.equal(foldProvinceKey("C.-B."), "cb");
    assert.equal(isCanadianProvinceCode("BC"), true);
    assert.equal(isCanadianProvinceCode("bc"), false);
  });
});
