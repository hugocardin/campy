import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMISSION_FIXED_MAX,
  COMMISSION_PERCENT_MAX,
  normalizeCommissionInput,
  parseCommissionTypeName,
} from "./campground-commission";

describe("parseCommissionTypeName", () => {
  it("accepts known names case-insensitively", () => {
    assert.equal(parseCommissionTypeName("percent"), "percent");
    assert.equal(parseCommissionTypeName("FIXED"), "fixed");
  });

  it("rejects unknown names", () => {
    assert.equal(parseCommissionTypeName("flat"), undefined);
    assert.equal(parseCommissionTypeName(1), undefined);
  });
});

describe("normalizeCommissionInput", () => {
  it("clears type and forces value 0", () => {
    assert.deepEqual(
      normalizeCommissionInput({
        commission_type_id: null,
        commission_value: "12.5",
        typeName: null,
      }),
      {
        ok: true,
        data: { commission_type_id: null, commission_value: 0 },
      },
    );
  });

  it("accepts percent in range", () => {
    assert.deepEqual(
      normalizeCommissionInput({
        commission_type_id: 1,
        commission_value: "15.5",
        typeName: "percent",
      }),
      {
        ok: true,
        data: { commission_type_id: 1, commission_value: 15.5 },
      },
    );
  });

  it("rejects percent above max", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 1,
      commission_value: COMMISSION_PERCENT_MAX + 0.01,
      typeName: "percent",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "value_out_of_range");
      assert.equal(result.field, "commission_value");
    }
  });

  it("accepts fixed at bounds", () => {
    assert.deepEqual(
      normalizeCommissionInput({
        commission_type_id: 2,
        commission_value: 0,
        typeName: "fixed",
      }),
      { ok: true, data: { commission_type_id: 2, commission_value: 0 } },
    );
    assert.deepEqual(
      normalizeCommissionInput({
        commission_type_id: 2,
        commission_value: COMMISSION_FIXED_MAX,
        typeName: "fixed",
      }),
      {
        ok: true,
        data: {
          commission_type_id: 2,
          commission_value: COMMISSION_FIXED_MAX,
        },
      },
    );
  });

  it("rejects more than 2 decimal places", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 1,
      commission_value: 1.234,
      typeName: "percent",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "value_invalid");
    }
  });

  it("rejects type id without resolved name", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 99,
      commission_value: 1,
      typeName: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.field, "commission_type_id");
    }
  });

  it("rejects empty value when type is set", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 1,
      commission_value: "",
      typeName: "percent",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.field, "commission_value");
    }
  });
});
