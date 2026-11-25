import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRICING_RULES_MAX_CHARS,
  coercePricingRulesObject,
  formatPricingRulesForEditor,
  isEmptyPricingRules,
  parsePricingRulesInput,
} from "./site-pricing-rules";

describe("coercePricingRulesObject", () => {
  it("returns {} for null, undefined, arrays, and primitives", () => {
    assert.deepEqual(coercePricingRulesObject(null), {});
    assert.deepEqual(coercePricingRulesObject(undefined), {});
    assert.deepEqual(coercePricingRulesObject([]), {});
    assert.deepEqual(coercePricingRulesObject("x"), {});
    assert.deepEqual(coercePricingRulesObject(1), {});
  });

  it("returns plain objects as-is", () => {
    const rules = { weekend: { multiplier: 1.2 } };
    assert.equal(coercePricingRulesObject(rules), rules);
  });
});

describe("formatPricingRulesForEditor", () => {
  it("pretty-prints empty and nested objects", () => {
    assert.equal(formatPricingRulesForEditor({}), "{}");
    assert.equal(
      formatPricingRulesForEditor({ season: { start: "06-01" } }),
      '{\n  "season": {\n    "start": "06-01"\n  }\n}',
    );
  });
});

describe("parsePricingRulesInput", () => {
  it("treats blank input as {}", () => {
    assert.deepEqual(parsePricingRulesInput(""), {
      ok: true,
      data: {},
    });
    assert.deepEqual(parsePricingRulesInput("   \n"), {
      ok: true,
      data: {},
    });
    assert.deepEqual(parsePricingRulesInput(null), {
      ok: true,
      data: {},
    });
  });

  it("accepts a plain JSON object", () => {
    const result = parsePricingRulesInput(
      '{\n  "weekend": { "multiplier": 1.25 }\n}',
    );
    assert.deepEqual(result, {
      ok: true,
      data: { weekend: { multiplier: 1.25 } },
    });
  });

  it("rejects invalid JSON", () => {
    const result = parsePricingRulesInput("{");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_json");
  });

  it("rejects non-object JSON roots", () => {
    for (const raw of ["[]", "null", '"hi"', "12", "true"]) {
      const result = parsePricingRulesInput(raw);
      assert.equal(result.ok, false, raw);
      if (!result.ok) assert.equal(result.reason, "not_object", raw);
    }
  });

  it("rejects oversized input", () => {
    const huge = `{"a":"${"x".repeat(PRICING_RULES_MAX_CHARS)}"}`;
    const result = parsePricingRulesInput(huge);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_large");
  });
});

describe("isEmptyPricingRules", () => {
  it("is true for empty / coerced empty", () => {
    assert.equal(isEmptyPricingRules({}), true);
    assert.equal(isEmptyPricingRules(null), true);
    assert.equal(isEmptyPricingRules([]), true);
  });

  it("is false when keys exist", () => {
    assert.equal(isEmptyPricingRules({ weekend: true }), false);
  });
});
