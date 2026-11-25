import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRICING_RULES_MAX_CHARS,
  PRICING_RULES_MAX_DEPTH,
  PRICING_RULES_RAW_TEXT_MAX_CHARS,
  coercePricingRulesObject,
  formatPricingRulesForEditor,
  inspectPricingRulesValue,
  isEmptyPricingRules,
  isParsePricingRulesReason,
  parsePricingRulesInput,
  pricingRulesErrorMessageKey,
  resolvePricingRulesForWrite,
  validatePricingRulesValue,
} from "./site-pricing-rules";

/** Build an object with `keyCount` short keys so pretty ≈ 1.8× compact. */
function manyKeysObject(keyCount: number): Record<string, number> {
  const obj: Record<string, number> = {};
  for (let i = 0; i < keyCount; i++) {
    obj[`m${i}`] = 1.1;
  }
  return obj;
}

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
    // Find a key count where compact fits the soft cap but pretty does not.
    let keyCount = 4_000;
    let many = manyKeysObject(keyCount);
    let compact = JSON.stringify(many);
    let pretty = JSON.stringify(many, null, 2);
    while (
      compact.length > PRICING_RULES_RAW_TEXT_MAX_CHARS ||
      pretty.length <= PRICING_RULES_RAW_TEXT_MAX_CHARS
    ) {
      keyCount +=
        compact.length > PRICING_RULES_RAW_TEXT_MAX_CHARS ? -200 : 200;
      assert.ok(keyCount > 500 && keyCount < 20_000, `keyCount=${keyCount}`);
      many = manyKeysObject(keyCount);
      compact = JSON.stringify(many);
      pretty = JSON.stringify(many, null, 2);
    }
    assert.equal(formatPricingRulesForEditor(many), compact);
  });
});

describe("parsePricingRulesInput", () => {
  it("treats blank input as {}", () => {
    assert.deepEqual(parsePricingRulesInput(""), { ok: true, data: {} });
    assert.deepEqual(parsePricingRulesInput("   \n"), { ok: true, data: {} });
    assert.deepEqual(parsePricingRulesInput(null), { ok: true, data: {} });
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

  it("re-edits a saved document when compact <= MAX < pretty (regression)", () => {
    // ~700 keys of `{mN:1.1}`: compact under 8192, pretty over 8192.
    // Old code rejected pretty text before parse → Save disabled forever.
    let keyCount = 700;
    let obj = manyKeysObject(keyCount);
    let compact = JSON.stringify(obj);
    let pretty = JSON.stringify(obj, null, 2);
    // Nudge key count if sizes drift so the pin stays meaningful.
    while (
      compact.length > PRICING_RULES_MAX_CHARS ||
      pretty.length <= PRICING_RULES_MAX_CHARS
    ) {
      keyCount += compact.length > PRICING_RULES_MAX_CHARS ? -20 : 20;
      assert.ok(keyCount > 100 && keyCount < 2_000, `keyCount=${keyCount}`);
      obj = manyKeysObject(keyCount);
      compact = JSON.stringify(obj);
      pretty = JSON.stringify(obj, null, 2);
    }
    assert.ok(
      compact.length <= PRICING_RULES_MAX_CHARS,
      `compact ${compact.length}`,
    );
    assert.ok(
      pretty.length > PRICING_RULES_MAX_CHARS,
      `pretty ${pretty.length}`,
    );

    const editorText = formatPricingRulesForEditor(obj);
    // Under soft cap, editor keeps pretty — the lockout case.
    assert.equal(editorText, pretty);
    const roundTrip = parsePricingRulesInput(editorText);
    assert.equal(roundTrip.ok, true, "pretty must re-parse after save/load");
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

  it("accepts exactly MAX_DEPTH containers with a scalar leaf", () => {
    // Root depth 0 … wrap MAX_DEPTH times → innermost container at depth MAX.
    let nested: unknown = { x: 1 };
    for (let i = 0; i < PRICING_RULES_MAX_DEPTH; i++) {
      nested = { c: nested };
    }
    const result = validatePricingRulesValue(nested);
    assert.equal(result.ok, true, "scalar leaf must not count as a depth level");
  });

  it("rejects MAX_DEPTH + 1 containers", () => {
    let nested: unknown = { x: 1 };
    for (let i = 0; i < PRICING_RULES_MAX_DEPTH + 1; i++) {
      nested = { c: nested };
    }
    const result = validatePricingRulesValue(nested);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "too_deep");
  });

  it("pins duplicate JSON keys as last-wins (JSON.parse)", () => {
    const result = parsePricingRulesInput('{"a":1,"a":2}');
    assert.deepEqual(result, { ok: true, data: { a: 2 } });
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

  it("returns invalid_json for BigInt (no throw)", () => {
    const bigintResult = validatePricingRulesValue({ n: BigInt(1) });
    assert.equal(bigintResult.ok, false);
    if (!bigintResult.ok) assert.equal(bigintResult.reason, "invalid_json");
  });

  it("rejects cyclic / shared refs as shared_ref (no throw, no exponential walk)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cyclicResult = validatePricingRulesValue(cyclic);
    assert.equal(cyclicResult.ok, false);
    if (!cyclicResult.ok) assert.equal(cyclicResult.reason, "shared_ref");

    // Doubling DAG: tiny wire size, exponential naive walk without WeakSet.
    let node: Record<string, unknown> = { x: 1 };
    for (let i = 0; i < 20; i++) {
      node = { l: node, r: node };
    }
    const dagResult = validatePricingRulesValue(node);
    assert.equal(dagResult.ok, false);
    if (!dagResult.ok) assert.equal(dagResult.reason, "shared_ref");
  });

  it("rejects arrays and primitives", () => {
    assert.equal(validatePricingRulesValue([]).ok, false);
    assert.equal(validatePricingRulesValue(null).ok, false);
    assert.equal(validatePricingRulesValue("x").ok, false);
  });
});

describe("isEmptyPricingRules", () => {
  it("is true for empty / missing; false for unexpected", () => {
    assert.equal(isEmptyPricingRules({}), true);
    assert.equal(isEmptyPricingRules(null), false);
    assert.equal(isEmptyPricingRules(undefined), true);
    assert.equal(isEmptyPricingRules([]), false);
  });

  it("is false when keys exist", () => {
    assert.equal(isEmptyPricingRules({ weekend: true }), false);
  });
});

describe("isParsePricingRulesReason / pricingRulesErrorMessageKey", () => {
  it("type-guards known reasons", () => {
    assert.equal(isParsePricingRulesReason("too_deep"), true);
    assert.equal(isParsePricingRulesReason("shared_ref"), true);
    assert.equal(isParsePricingRulesReason("nope"), false);
    assert.equal(isParsePricingRulesReason(1), false);
  });

  it("maps reasons to message keys", () => {
    assert.equal(
      pricingRulesErrorMessageKey("not_object"),
      "pricingRulesNotObject",
    );
    assert.equal(
      pricingRulesErrorMessageKey("too_deep"),
      "pricingRulesTooDeep",
    );
    assert.equal(
      pricingRulesErrorMessageKey("shared_ref"),
      "pricingRulesSharedRef",
    );
  });
});
