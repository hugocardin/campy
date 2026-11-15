import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANADIAN_PROVINCE_CODES,
  PROVINCE_ALIAS_MATCH_MAX,
  assertNoFoldedAliasCollisions,
  distinctProvinceRaws,
  foldProvinceKey,
  isCanadianProvinceCode,
  provinceFilterKey,
  provinceMatchValues,
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

  it("rejects malicious / wildcard URL values", () => {
    assert.equal(resolveProvinceCode('a",b.eq.c'), null);
    assert.equal(resolveProvinceCode("%"), null);
    assert.equal(resolveProvinceCode("_%"), null);
    assert.equal(resolveProvinceCode('x",active.eq.false'), null);
  });
});

describe("provinceFilterKey / uniqueProvinceFilterKeys", () => {
  it("URL and option list are code-only (unknown DB free text omitted)", () => {
    assert.equal(provinceFilterKey("Québec"), "QC");
    assert.equal(provinceFilterKey("%"), null);
    assert.equal(provinceFilterKey('a",b.eq.c'), null);
    assert.deepEqual(
      uniqueProvinceFilterKeys(["QC", "Quebec", "Québec", "BC", "bc", "Weird"]),
      ["BC", "QC"],
    );
  });
});

describe("provinceMatchValues", () => {
  it("expands a code to controlled aliases only", () => {
    const values = provinceMatchValues("QC");
    assert.ok(values.includes("QC"));
    assert.ok(values.includes("Quebec"));
    assert.ok(values.includes("Québec"));
    assert.deepEqual(provinceMatchValues("Customland"), []);
    assert.deepEqual(provinceMatchValues("%"), []);
    assert.deepEqual(provinceMatchValues('a",b.eq.c'), []);
  });

  it("merges distinct DB raw values that fold to the code", () => {
    const values = provinceMatchValues("QC", ["Québec!", "QC", "Ontario"]);
    assert.ok(values.includes("Québec!"));
    assert.ok(values.includes("QC"));
    assert.ok(!values.includes("Ontario"));
  });

  it("stays within PROVINCE_ALIAS_MATCH_MAX for every shipped code", () => {
    for (const code of CANADIAN_PROVINCE_CODES) {
      const values = provinceMatchValues(code);
      assert.ok(
        values.length <= PROVINCE_ALIAS_MATCH_MAX,
        `${code} has ${values.length} aliases (max ${PROVINCE_ALIAS_MATCH_MAX})`,
      );
    }
  });

  it("does not pad with redundant lowercase duplicates of static aliases", () => {
    const values = provinceMatchValues("BC");
    assert.ok(values.includes("BC"));
    assert.ok(!values.includes("bc"));
    assert.ok(values.includes("British Columbia"));
  });
});

describe("distinctProvinceRaws", () => {
  it("trims and dedupes preserving spelling", () => {
    assert.deepEqual(
      distinctProvinceRaws([" BC ", "BC", "Québec", null, ""]),
      ["BC", "Québec"],
    );
  });
});

describe("folded alias collisions", () => {
  it("assertNoFoldedAliasCollisions passes for the shipped map", () => {
    assert.doesNotThrow(() => assertNoFoldedAliasCollisions());
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
