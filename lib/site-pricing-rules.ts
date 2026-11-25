/**
 * `sites.pricing_rules` is jsonb default `'{}'::jsonb` (nullable, no CHECK).
 * Column comment on `price_per_night_base` mentions future weekend/season/
 * per-person rules, but there is no typed schema yet — guest search ignores
 * this column until date-aware pricing (Phase D).
 *
 * Admin UI: safe JSON **object** editor only. Do not invent a booking engine.
 */

/** Max length of the editor text / serialized payload (UTF-16 code units). */
export const PRICING_RULES_MAX_CHARS = 8_192;

/** Empty rules document — matches DB default. */
export const EMPTY_PRICING_RULES: Readonly<Record<string, never>> = {};

export type PricingRulesObject = Record<string, unknown>;

export type ParsePricingRulesFailure = {
  ok: false;
  reason: "invalid_json" | "not_object" | "too_large";
};

export type ParsePricingRulesSuccess = {
  ok: true;
  data: PricingRulesObject;
};

export type ParsePricingRulesResult =
  | ParsePricingRulesSuccess
  | ParsePricingRulesFailure;

function isPlainObject(value: unknown): value is PricingRulesObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Coerce a DB / form value to a plain object. Null/undefined/non-objects → {}.
 */
export function coercePricingRulesObject(value: unknown): PricingRulesObject {
  if (value == null) return { ...EMPTY_PRICING_RULES };
  if (!isPlainObject(value)) return { ...EMPTY_PRICING_RULES };
  return value;
}

/** Pretty-print for the admin textarea / detail view. */
export function formatPricingRulesForEditor(value: unknown): string {
  return JSON.stringify(coercePricingRulesObject(value), null, 2);
}

/**
 * Parse admin textarea input into a jsonb-safe plain object.
 * Blank / whitespace-only → `{}`.
 */
export function parsePricingRulesInput(
  raw: string | null | undefined,
): ParsePricingRulesResult {
  const text = raw == null ? "" : String(raw);
  if (text.length > PRICING_RULES_MAX_CHARS) {
    return { ok: false, reason: "too_large" };
  }

  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: true, data: { ...EMPTY_PRICING_RULES } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "not_object" };
  }

  // Re-serialize to confirm stable size and drop exotic key ordering issues.
  let serialized: string;
  try {
    serialized = JSON.stringify(parsed);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (serialized.length > PRICING_RULES_MAX_CHARS) {
    return { ok: false, reason: "too_large" };
  }

  return { ok: true, data: parsed };
}

/** True when rules are the empty document (or coerced empty). */
export function isEmptyPricingRules(value: unknown): boolean {
  const obj = coercePricingRulesObject(value);
  return Object.keys(obj).length === 0;
}
