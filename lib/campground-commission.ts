/**
 * Campground commission terms (`commission_type_id` + `commission_value`).
 * Data entry only — no Stripe Connect / payouts.
 *
 * Known type names in `commission_types.name`: `percent` | `fixed`.
 */

import {
  formatCampgroundPricePerNight,
  resolveCampgroundPriceCurrency,
} from "@/lib/campground-price";

export const COMMISSION_TYPE_NAMES = ["percent", "fixed"] as const;

export type CommissionTypeName = (typeof COMMISSION_TYPE_NAMES)[number];

const NAME_SET = new Set<string>(COMMISSION_TYPE_NAMES);

/**
 * Max fixed commission amount (listing currency units).
 * Tied to `campgrounds.commission_value numeric(8,2)` → max 999,999.99.
 */
export const COMMISSION_FIXED_MAX = 999_999.99;

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

/**
 * Display kind for admin detail/form labels.
 * - none: no type set
 * - percent / fixed: known type
 * - unknown: type id set but name missing or not in the closed union
 */
export function resolveCommissionDisplayKind(
  typeId: number | null | undefined,
  typeName: string | null | undefined,
): "none" | CommissionTypeName | "unknown" {
  if (typeId == null) return "none";
  const known = parseCommissionTypeName(typeName);
  if (known) return known;
  return "unknown";
}

function hasAtMostFractionDigits(value: number, maxDigits: number): boolean {
  if (!Number.isFinite(value)) return false;
  const factor = 10 ** maxDigits;
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-8;
}

/**
 * Normalize decimal separators for locale-typed form values.
 * Only `,` with 1–2 fractional digits is treated as a decimal (e.g. `12,5`).
 * Grouping commas (`1,000`) are left alone so they fail as invalid rather than
 * silently becoming `1.000` → 1.
 */
export function normalizeDecimalInput(
  raw: number | string | null | undefined,
): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined;
    return String(raw);
  }
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  // fr-CA style decimal comma only — not a thousands separator.
  if (/^\d+,\d{1,2}$/.test(trimmed)) {
    return trimmed.replace(",", ".");
  }
  return trimmed;
}

/** Strict decimal shape after optional `,` → `.` normalization (no exp/hex). */
const STRICT_DECIMAL = /^\d+(?:\.\d{1,2})?$/;

function parseNonNegativeNumber(
  raw: number | string | null | undefined,
): number | undefined {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return undefined;
    if (!hasAtMostFractionDigits(raw, MAX_FRACTION_DIGITS)) return undefined;
    return raw;
  }
  const normalized = normalizeDecimalInput(raw);
  if (normalized == null) return undefined;
  // Reject scientific / hex / binary / octal that Number() would accept.
  if (!STRICT_DECIMAL.test(normalized)) return undefined;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

export type NormalizeCommissionInput = {
  /** Nullable FK; empty / null clears the type. */
  commission_type_id: number | null | undefined;
  /** Numeric or string from forms; ignored when type is cleared. */
  commission_value: number | string | null | undefined;
  /** Resolved `commission_types.name` when type_id is set (`percent` | `fixed`). */
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
 * - Unknown type names fail closed (`type_mismatch`).
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

  const known = parseCommissionTypeName(input.typeName);
  if (!known) {
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

  const max =
    known === "percent"
      ? COMMISSION_PERCENT_MAX
      : known === "fixed"
        ? COMMISSION_FIXED_MAX
        : (() => {
            const _never: never = known;
            throw new Error(`Unhandled commission type: ${_never}`);
          })();

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

/** Locale-aware percent display (value is 0–100, not a fraction). */
export function formatCommissionPercent(
  value: number,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

/** Locale-aware fixed commission amount (always 2 fraction digits). */
export function formatCommissionFixed(
  value: number,
  locale: string,
  currency: string,
): string {
  return (
    formatCampgroundPricePerNight(value, locale, currency, {
      fractionDigits: 2,
    }) ??
    `${value.toFixed(2)} ${resolveCampgroundPriceCurrency(currency)}`
  );
}

/** Raw numeric fallback when the type is unknown. */
export function formatCommissionUnknownValue(
  value: number,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
