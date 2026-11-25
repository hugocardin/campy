import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRICING_RULES_MAX_CHARS,
  PRICING_RULES_RAW_TEXT_MAX_CHARS,
  coercePricingRulesObject,
  formatPricingRulesForEditor,
  inspectPricingRulesValue,
  isEmptyPricingRules,
  parsePricingRulesInput,
  pricingRulesErrorMessageKey,
  resolvePricingRulesForWrite,
  validatePricingRulesValue,
} from "./site-pricing-rules";

describe("coercePricingRulesObject", () => {
  it("returns a copy of {} for null, undefined, arrays, and primitives", () => {
    assert.deepEqual(coercePricingRulesObject(null), {});
    assert.deepEqual(coercePricingRulesObject(undefined), {});
    assert.deepEqual(coercePricingRulesObject([]), {});
    assert.deepEqual(coercePricingRulesObject("x"), {});
    assert.deepEqual(coercePricingRulesObject(1), {});
  });

  it("returns a shallow copy of plain objects (does not alias source)", () => {
    const rules = { weekend: { multiplier: 1.2 } };
    const coerced = coercePricingRulesObject(rules);
    assert.deepEqual(coerced, rules);
    assert.notEqual(coerced, rules);
  });
});

describe("inspectPricingRulesValue", () => {
  it("distinguishes missing vs unexpected vs ok", () => {
    assert.equal(inspectPricingRulesValue(undefined).kind, "missing");
    assert.equal(inspectPricingRulesValue(null).kind, "unexpected");
    assert.equal(inspectPricingRulesValue([]).kind, "unexpected");
    assert.equal(inspectPricingRulesValue({}).kind, "ok");
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

  it("falls back to compact when pretty would exceed the raw-text soft cap", () => {
    // Long string values: pretty adds little vs compact for one key, so use
    // many short keys (pretty ≈ 1.8× compact) to cross the soft cap.
    const many: Record<string, number> = {};
    for (let i = 0; i < 6_000; i++) {
      many[`k${i}`] = 1;
    }
    const compact = JSON.stringify(many);
    const pretty = JSON.stringify(many, null, 2);
    assert.ok(
      compact.length <= PRICING_RULES_RAW_TEXT_MAX_CHARS,
      `compact ${compact.length}`,
    );
    assert.ok(
      pretty.length > PRICING_RULES_RAW_TEXT_MAX_CHARS,
      `pretty ${pretty.length}`,
    );
    const formatted = formatPricingRulesForEditor(many);
    assert.equal(formatted, compact);
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

  it("accepts pretty text whose compact form is under the limit", () => {
    // Compact ~5k keys under 8192; pretty would be larger — must still parse.
    const obj: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      obj[`m${i}`] = 1.1;
    }
    const compact = JSON.stringify(obj);
    const pretty = JSON.stringify(obj, null, 2);
    assert.ok(compact.length < PRICING_RULES_MAX_CHARS);
    assert.ok(pretty.length > compact.length);
    assert.ok(pretty.length < PRICING_RULES_RAW_TEXT_MAX_CHARS);
    const result = parsePricingRulesInput(pretty);
    assert.equal(result.ok, true);
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

  it("rejects oversized compact payload", () => {
    const huge = `{"a":"${"x".repeat(PRICING_RULES_MAX_CHARS)}"}`;
    const result = parsePricingRulesInput(huge);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_large");
  });

  it("rejects forbidden keys at any depth", () => {
    for (const raw of [
      '{"__proto__": {}}',
      '{"constructor": 1}',
      '{"a": {"prototype": true}}',
    ]) {
      const result = parsePricingRulesInput(raw);
      assert.equal(result.ok, false, raw);
      if (!result.ok) assert.equal(result.reason, "forbidden_key", raw);
    }
  });

  it("rejects non-finite numbers (1e400 → Infinity)", () => {
    const result = parsePricingRulesInput('{"n": 1e400}');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "non_finite_number");
  });
});

describe("validatePricingRulesValue / resolvePricingRulesForWrite", () => {
  it("omits undefined on write resolve", () => {
    assert.deepEqual(resolvePricingRulesForWrite(undefined), {
      ok: true,
      omit: true,
    });
  });

  it("accepts object and string inputs", () => {
    assert.deepEqual(resolvePricingRulesForWrite({ weekend: 1 }), {
      ok: true,
      data: { weekend: 1 },
    });
    assert.deepEqual(resolvePricingRulesForWrite('{"weekend":1}'), {
      ok: true,
      data: { weekend: 1 },
    });
  });

  it("returns invalid_json for BigInt and cyclic objects (no throw)", () => {
    const bigintResult = validatePricingRulesValue({ n: BigInt(1) });
    assert.equal(bigintResult.ok, false);
    if (!bigintResult.ok) assert.equal(bigintResult.reason, "invalid_json");

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cyclicResult = validatePricingRulesValue(cyclic);
    assert.equal(cyclicResult.ok, false);
    if (!cyclicResult.ok) assert.equal(cyclicResult.reason, "invalid_json");
  });

  it("rejects arrays and primitives", () => {
    assert.equal(validatePricingRulesValue([]).ok, false);
    assert.equal(validatePricingRulesValue(null).ok, false);
    assert.equal(validatePricingRulesValue("x").ok, false);
  });
});

describe("isEmptyPricingRules", () => {
  it("is true for empty / coerced empty / missing", () => {
    assert.equal(isEmptyPricingRules({}), true);
    assert.equal(isEmptyPricingRules(null), false); // unexpected, not empty
    assert.equal(isEmptyPricingRules(undefined), true); // missing
    assert.equal(isEmptyPricingRules([]), false);
  });

  it("is false when keys exist", () => {
    assert.equal(isEmptyPricingRules({ weekend: true }), false);
  });
});

describe("pricingRulesErrorMessageKey", () => {
  it("maps reasons to message keys", () => {
    assert.equal(
      pricingRulesErrorMessageKey("not_object"),
      "pricingRulesNotObject",
    );
    assert.equal(
      pricingRulesErrorMessageKey("forbidden_key"),
      "pricingRulesForbiddenKey",
    );
    assert.equal(
      pricingRulesErrorMessageKey("too_large"),
      "pricingRulesTooLong",
    );
  });
});
