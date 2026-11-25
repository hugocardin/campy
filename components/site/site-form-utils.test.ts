import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePricingRulesFormState } from "@/components/site/site-form-utils";
import { PRICING_RULES_MAX_CHARS } from "@/lib/site-pricing-rules";

describe("resolvePricingRulesFormState", () => {
  it("create invalid → blocking, no payload", () => {
    const result = resolvePricingRulesFormState({
      isEdit: false,
      text: "not-json",
      initialText: "",
    });
    assert.equal(result.blocking, true);
    assert.equal(result.dirty, true);
    assert.equal(result.storedOutOfBounds, false);
    assert.equal(result.payload, undefined);
    assert.equal(result.parsed.ok, false);
  });

  it("create valid → payload is parsed object", () => {
    const result = resolvePricingRulesFormState({
      isEdit: false,
      text: '{"weekend":1}',
      initialText: "",
    });
    assert.equal(result.blocking, false);
    assert.equal(result.storedOutOfBounds, false);
    assert.deepEqual(result.payload, { weekend: 1 });
  });

  it("edit unchanged invalid → omit payload, storedOutOfBounds warning", () => {
    const huge = `{"x":"${"a".repeat(PRICING_RULES_MAX_CHARS)}"}`;
    const result = resolvePricingRulesFormState({
      isEdit: true,
      text: huge,
      initialText: huge,
    });
    assert.equal(result.dirty, false);
    assert.equal(result.blocking, false);
    assert.equal(result.storedOutOfBounds, true);
    assert.equal(result.payload, undefined);
    assert.equal(result.parsed.ok, false);
  });

  it("edit unexpected → dirty, payload {}, no storedOutOfBounds", () => {
    const result = resolvePricingRulesFormState({
      isEdit: true,
      text: "{}",
      initialText: "{}",
      unexpected: true,
    });
    assert.equal(result.dirty, true);
    assert.equal(result.blocking, false);
    assert.equal(result.storedOutOfBounds, false);
    assert.deepEqual(result.payload, {});
    assert.equal(result.parsed.ok, true);
  });

  it("edit dirty valid → payload is parsed object", () => {
    const result = resolvePricingRulesFormState({
      isEdit: true,
      text: '{"season":true}',
      initialText: "{}",
    });
    assert.equal(result.dirty, true);
    assert.equal(result.blocking, false);
    assert.equal(result.storedOutOfBounds, false);
    assert.deepEqual(result.payload, { season: true });
  });

  it("edit dirty invalid → blocking", () => {
    const result = resolvePricingRulesFormState({
      isEdit: true,
      text: "[",
      initialText: "{}",
    });
    assert.equal(result.dirty, true);
    assert.equal(result.blocking, true);
    assert.equal(result.storedOutOfBounds, false);
    assert.equal(result.payload, undefined);
  });

  it("edit unchanged valid → omit payload", () => {
    const result = resolvePricingRulesFormState({
      isEdit: true,
      text: "{}",
      initialText: "{}",
    });
    assert.equal(result.dirty, false);
    assert.equal(result.blocking, false);
    assert.equal(result.storedOutOfBounds, false);
    assert.equal(result.payload, undefined);
  });
});
