import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  COMMISSION_FIXED_MAX,
  COMMISSION_GUARD_DETAIL,
  COMMISSION_GUARD_SQL_MESSAGE_PREFIXES,
  COMMISSION_PERCENT_MAX,
  formatCommissionFixed,
  formatCommissionPercent,
  normalizeCommissionInput,
  normalizeDecimalInput,
  parseCampgroundCommissionGuardError,
  parseCommissionTypeName,
  resolveCommissionDisplayKind,
} from "./campground-commission";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

/** Latest migration that defines `campgrounds_enforce_commission_value`. */
function latestCommissionEnforceMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest: string | null = null;
  for (const name of files) {
    const body = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    if (
      /CREATE OR REPLACE FUNCTION\s+public\.campgrounds_enforce_commission_value\s*\(/i.test(
        body,
      )
    ) {
      latest = body;
    }
  }
  assert.ok(
    latest,
    "expected a migration defining campgrounds_enforce_commission_value",
  );
  return latest!;
}

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

describe("normalizeCommissionInput strict decimal", () => {
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

  it("rejects scientific and hex that Number() would accept", () => {
    for (const value of ["1e2", "1e-2", "0x64", "0b11", "0o7", "1,000.50"]) {
      const result = normalizeCommissionInput({
        commission_type_id: 2,
        commission_value: value,
        typeName: "fixed",
      });
      assert.equal(result.ok, false, value);
      if (!result.ok) {
        assert.equal(result.reason, "value_invalid", value);
      }
    }
  });

  it("rejects bare fraction forms", () => {
    for (const value of [".5", ",5"]) {
      const result = normalizeCommissionInput({
        commission_type_id: 1,
        commission_value: value,
        typeName: "percent",
      });
      assert.equal(result.ok, false, value);
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

describe("parseCampgroundCommissionGuardError", () => {
  it("reads EXCEPTION DETAIL first", () => {
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        message: "noise",
        details: COMMISSION_GUARD_DETAIL.percentMax,
      }),
      {
        field: "campground.commission_value",
        reason: "value_out_of_range",
      },
    );
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        details: COMMISSION_GUARD_DETAIL.fixedMax,
      }),
      {
        field: "campground.commission_value",
        reason: "value_out_of_range",
      },
    );
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        details: COMMISSION_GUARD_DETAIL.typeMissing,
      }),
      {
        field: "campground.commission_type_id",
        reason: "type_mismatch",
      },
    );
  });

  it("matches pinned SQL message prefixes", () => {
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        message: `${COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.percentMax} 101`,
      }),
      {
        field: "campground.commission_value",
        reason: "value_out_of_range",
      },
    );
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        message: `${COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.fixedMax} too big`,
      }),
      {
        field: "campground.commission_value",
        reason: "value_out_of_range",
      },
    );
    assert.deepEqual(
      parseCampgroundCommissionGuardError({
        message: `${COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.typeMissing} 9`,
      }),
      {
        field: "campground.commission_type_id",
        reason: "type_mismatch",
      },
    );
  });

  it("ignores unrelated errors", () => {
    assert.equal(
      parseCampgroundCommissionGuardError({
        message: "some other check",
        details: "unrelated",
      }),
      null,
    );
    assert.equal(parseCampgroundCommissionGuardError({}), null);
  });
});

describe("commission DB guard migration pins", () => {
  it("keeps SQL literals in sync with TS constants and DETAIL markers", () => {
    // Pin against the latest CREATE OR REPLACE of the enforce function so a
    // future redefine cannot drift from COMMISSION_*_MAX while this test still
    // passes against an older applied migration file.
    const sql = latestCommissionEnforceMigrationSql();

    assert.match(
      sql,
      new RegExp(`NEW\\.commission_value > ${COMMISSION_PERCENT_MAX}\\b`),
      "percent cap must match COMMISSION_PERCENT_MAX",
    );
    assert.match(
      sql,
      new RegExp(
        `NEW\\.commission_value > ${String(COMMISSION_FIXED_MAX).replace(".", "\\.")}\\b`,
      ),
      "fixed cap must match COMMISSION_FIXED_MAX",
    );
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /DETAIL = 'commission_percent_max'/);
    assert.match(sql, /DETAIL = 'commission_fixed_max'/);
    assert.match(sql, /DETAIL = 'commission_type_missing'/);
    assert.ok(sql.includes(COMMISSION_GUARD_DETAIL.percentMax));
    assert.ok(sql.includes(COMMISSION_GUARD_DETAIL.fixedMax));
    assert.ok(sql.includes(COMMISSION_GUARD_DETAIL.typeMissing));
    assert.ok(
      sql.includes(COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.percentMax),
    );
    assert.ok(sql.includes(COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.fixedMax));
    assert.ok(
      sql.includes(COMMISSION_GUARD_SQL_MESSAGE_PREFIXES.typeMissing),
    );
  });
});
