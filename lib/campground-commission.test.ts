import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMISSION_FIXED_MAX,
  COMMISSION_PERCENT_MAX,
  formatCommissionFixed,
  formatCommissionPercent,
  normalizeCommissionInput,
  normalizeDecimalInput,
  parseCommissionTypeName,
  resolveCommissionDisplayKind,
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

describe("normalizeDecimalInput", () => {
  it("accepts comma decimals with 1–2 fraction digits", () => {
    assert.equal(normalizeDecimalInput("5,00"), "5.00");
    assert.equal(normalizeDecimalInput("12,5"), "12.5");
  });

  it("does not treat grouping commas as decimals", () => {
    assert.equal(normalizeDecimalInput("1,000"), "1,000");
    assert.equal(normalizeDecimalInput("2,500"), "2,500");
  });

  it("leaves dot decimals alone", () => {
    assert.equal(normalizeDecimalInput("5.00"), "5.00");
  });
});

describe("normalizeCommissionInput grouping commas", () => {
  it("rejects 1,000 as invalid (not one)", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 2,
      commission_value: "1,000",
      typeName: "fixed",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "value_invalid");
    }
  });
});

describe("resolveCommissionDisplayKind", () => {
  it("returns none / known / unknown", () => {
    assert.equal(resolveCommissionDisplayKind(null, null), "none");
    assert.equal(resolveCommissionDisplayKind(1, "percent"), "percent");
    assert.equal(resolveCommissionDisplayKind(2, "fixed"), "fixed");
    assert.equal(resolveCommissionDisplayKind(1, null), "unknown");
    assert.equal(resolveCommissionDisplayKind(3, "tiered"), "unknown");
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

  it("accepts comma decimals for percent", () => {
    assert.deepEqual(
      normalizeCommissionInput({
        commission_type_id: 1,
        commission_value: "12,5",
        typeName: "percent",
      }),
      {
        ok: true,
        data: { commission_type_id: 1, commission_value: 12.5 },
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

  it("accepts fixed at numeric(8,2) bounds", () => {
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

  it("rejects fixed above numeric(8,2) max", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 2,
      commission_value: 1_000_000,
      typeName: "fixed",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "value_out_of_range");
    }
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

  it("rejects unknown type names (fail closed)", () => {
    const result = normalizeCommissionInput({
      commission_type_id: 99,
      commission_value: 1,
      typeName: "tiered",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.field, "commission_type_id");
      assert.equal(result.reason, "type_mismatch");
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

describe("formatCommission*", () => {
  it("formats percent and fixed for en-CA / fr-CA", () => {
    assert.match(formatCommissionPercent(12.5, "en-CA"), /12\.5\s*%/);
    assert.match(formatCommissionPercent(12.5, "fr-CA"), /12[,.]5/);
    assert.match(formatCommissionFixed(5, "en-CA", "CAD"), /5\.00/);
    assert.match(formatCommissionFixed(5.5, "fr-CA", "CAD"), /5[,.]50/);
  });
});
