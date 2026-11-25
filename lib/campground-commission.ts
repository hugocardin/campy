/**
 * Campground commission terms (`commission_type_id` + `commission_value`).
 * Data entry only — no Stripe Connect / payouts.
 *
 * Known type names in `commission_types.name`: `percent` | `fixed`.
 */

export const COMMISSION_TYPE_NAMES = ["percent", "fixed"] as const;

export type CommissionTypeName = (typeof COMMISSION_TYPE_NAMES)[number];

const NAME_SET = new Set<string>(COMMISSION_TYPE_NAMES);

/** Max fixed commission amount (listing currency units). */
export const COMMISSION_FIXED_MAX = 1_000_000;

/** Max percent commission (inclusive). */
export const COMMISSION_PERCENT_MAX = 100;

const MAX_FRACTION_DIGITS = 2;

export function isCommissionTypeName(
  value: string,
): value is CommissionTypeName {
  return NAME_SET.has(value);
}

export function parseCommissionTypeName(
  value: unknown,
): CommissionTypeName | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (isCommissionTypeName(trimmed)) return trimmed;
  return undefined;
}

function hasAtMostFractionDigits(value: number, maxDigits: number): boolean {
  if (!Number.isFinite(value)) return false;
  const factor = 10 ** maxDigits;
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-8;
}

function parseNonNegativeNumber(
  raw: number | string | null | undefined,
): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

export type NormalizeCommissionInput = {
  /** Nullable FK; empty / null clears the type. */
  commission_type_id: number | null | undefined;
  /** Numeric or string from forms; ignored when type is cleared. */
  commission_value: number | string | null | undefined;
  /**
   * Resolved `commission_types.name` when type_id is set.
   * Known names use typed ranges; any other non-null name uses the fixed max.
   */
  typeName: string | null;
};

export type NormalizedCommission = {
  commission_type_id: number | null;
  commission_value: number;
};

/**
 * Normalize admin write of commission fields.
 * - No type → type null, value 0 (matches column default / demo rows).
 * - percent → 0..100, ≤2 decimal places.
 * - fixed → 0..COMMISSION_FIXED_MAX, ≤2 decimal places.
 */
export function normalizeCommissionInput(
  input: NormalizeCommissionInput,
):
  | { ok: true; data: NormalizedCommission }
  | {
      ok: false;
      reason: "type_mismatch" | "value_invalid" | "value_out_of_range";
      field: "commission_type_id" | "commission_value";
    } {
  const typeIdRaw = input.commission_type_id;
  const typeId =
    typeIdRaw == null ||
    (typeof typeIdRaw === "number" && !Number.isFinite(typeIdRaw))
      ? null
      : typeIdRaw;

  if (typeId == null) {
    if (input.typeName != null) {
      return {
        ok: false,
        reason: "type_mismatch",
        field: "commission_type_id",
      };
    }
    return {
      ok: true,
      data: { commission_type_id: null, commission_value: 0 },
    };
  }

  if (!Number.isInteger(typeId) || typeId < 1 || input.typeName == null) {
    return {
      ok: false,
      reason: "type_mismatch",
      field: "commission_type_id",
    };
  }

  const num = parseNonNegativeNumber(input.commission_value);
  if (num == null) {
    return { ok: false, reason: "value_invalid", field: "commission_value" };
  }
  if (!hasAtMostFractionDigits(num, MAX_FRACTION_DIGITS)) {
    return { ok: false, reason: "value_invalid", field: "commission_value" };
  }

  const known = parseCommissionTypeName(input.typeName);
  const max =
    known === "percent" ? COMMISSION_PERCENT_MAX : COMMISSION_FIXED_MAX;
  if (num > max) {
    return {
      ok: false,
      reason: "value_out_of_range",
      field: "commission_value",
    };
  }

  return {
    ok: true,
    data: { commission_type_id: typeId, commission_value: num },
  };
}
