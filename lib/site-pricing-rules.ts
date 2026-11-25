/**
 * `sites.pricing_rules` is jsonb default `'{}'::jsonb`.
 * Column comment on `price_per_night_base` mentions future weekend/season/
 * per-person rules, but there is no typed schema yet — guest search ignores
 * this column until date-aware pricing (Phase D).
 *
 * Admin UI: safe JSON **object** editor only. Do not invent a booking engine.
 */

/** Max length of the *compact* serialized payload (UTF-16 code units). */
export const PRICING_RULES_MAX_CHARS = 8_192;

/**
 * Soft cap on raw editor text (anti-DoS). Pretty-printed JSON can be several
 * times larger than compact; the authoritative size is compact re-serialization.
 */
export const PRICING_RULES_RAW_TEXT_MAX_CHARS = PRICING_RULES_MAX_CHARS * 8;

/** Empty rules document — matches DB default. */
export const EMPTY_PRICING_RULES: Readonly<Record<string, never>> = {};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type PricingRulesObject = Record<string, unknown>;

export type ParsePricingRulesReason =
  | "invalid_json"
  | "not_object"
  | "too_large"
  | "forbidden_key"
  | "non_finite_number";

export type ParsePricingRulesFailure = {
  ok: false;
  reason: ParsePricingRulesReason;
};

export type ParsePricingRulesSuccess = {
  ok: true;
  data: PricingRulesObject;
};

export type ParsePricingRulesResult =
  | ParsePricingRulesSuccess
  | ParsePricingRulesFailure;

/**
 * How a DB / loader value relates to a plain object.
 * - `ok` — plain object (may be empty)
 * - `missing` — column not selected / undefined
 * - `unexpected` — null, array, scalar, or non-plain object
 */
export type InspectPricingRulesResult =
  | { kind: "ok"; data: PricingRulesObject }
  | { kind: "missing" }
  | { kind: "unexpected"; value: unknown };

function isPlainObject(value: unknown): value is PricingRulesObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Inspect a DB / form value without coercing unexpected shapes to `{}`.
 */
export function inspectPricingRulesValue(
  value: unknown,
): InspectPricingRulesResult {
  if (value === undefined) return { kind: "missing" };
  if (!isPlainObject(value)) return { kind: "unexpected", value };
  return { kind: "ok", data: value };
}

/**
 * Coerce a known-good or absent value to a plain object copy.
 * Unexpected shapes (array/scalar/null) still map to `{}` for list fallbacks;
 * prefer {@link inspectPricingRulesValue} when displaying a loaded site.
 */
export function coercePricingRulesObject(value: unknown): PricingRulesObject {
  const inspected = inspectPricingRulesValue(value);
  if (inspected.kind === "ok") return { ...inspected.data };
  return { ...EMPTY_PRICING_RULES };
}

/** Pretty-print for the admin textarea / detail view; fall back to compact if pretty is huge. */
export function formatPricingRulesForEditor(value: unknown): string {
  const obj = coercePricingRulesObject(value);
  const pretty = JSON.stringify(obj, null, 2);
  if (pretty.length <= PRICING_RULES_RAW_TEXT_MAX_CHARS) {
    return pretty;
  }
  return JSON.stringify(obj);
}

/**
 * Walk a parsed JSON value and reject dangerous keys / non-finite numbers.
 */
export function walkPricingRulesValue(
  value: unknown,
  depth = 0,
): ParsePricingRulesFailure | null {
  if (depth > 32) {
    return { ok: false, reason: "invalid_json" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: "non_finite_number" };
    }
    return null;
  }
  if (
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return { ok: false, reason: "invalid_json" };
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = walkPricingRulesValue(item, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  if (!isPlainObject(value)) {
    return { ok: false, reason: "not_object" };
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { ok: false, reason: "forbidden_key" };
    }
    const nested = walkPricingRulesValue(value[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Validate an already-parsed unknown value (server-action trust boundary).
 * Safe against BigInt / cycles via try/catch around stringify.
 */
export function validatePricingRulesValue(
  value: unknown,
): ParsePricingRulesResult {
  if (value === undefined) {
    return { ok: false, reason: "invalid_json" };
  }
  if (!isPlainObject(value)) {
    return { ok: false, reason: "not_object" };
  }

  const walked = walkPricingRulesValue(value);
  if (walked) return walked;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (serialized == null || serialized.length > PRICING_RULES_MAX_CHARS) {
    return { ok: false, reason: "too_large" };
  }

  // Re-parse so Infinity/undefined coercion can't sneak past stringify.
  let reparsed: unknown;
  try {
    reparsed = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!isPlainObject(reparsed)) {
    return { ok: false, reason: "not_object" };
  }
  const rewalked = walkPricingRulesValue(reparsed);
  if (rewalked) return rewalked;

  return { ok: true, data: reparsed };
}

/**
 * Parse admin textarea input into a jsonb-safe plain object.
 * Blank / whitespace-only → `{}`.
 * Authoritative size is compact re-serialization; raw text only has a soft cap.
 */
export function parsePricingRulesInput(
  raw: string | null | undefined,
): ParsePricingRulesResult {
  const text = raw == null ? "" : String(raw);
  if (text.length > PRICING_RULES_RAW_TEXT_MAX_CHARS) {
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

  return validatePricingRulesValue(parsed);
}

/**
 * Resolve `pricing_rules` for a write at the server-action trust boundary.
 * - `undefined` → omit (caller must not write the column)
 * - object / string → validate
 */
export function resolvePricingRulesForWrite(
  raw: unknown,
):
  | { ok: true; data: PricingRulesObject }
  | { ok: true; omit: true }
  | ParsePricingRulesFailure {
  if (raw === undefined) {
    return { ok: true, omit: true };
  }
  if (typeof raw === "string") {
    return parsePricingRulesInput(raw);
  }
  return validatePricingRulesValue(raw);
}

/** True when rules are the empty document (or coerced empty). */
export function isEmptyPricingRules(value: unknown): boolean {
  const inspected = inspectPricingRulesValue(value);
  if (inspected.kind !== "ok") return inspected.kind === "missing";
  return Object.keys(inspected.data).length === 0;
}

/** Map parse failure reason → sites.errors.* message key (minus namespace). */
export function pricingRulesErrorMessageKey(
  reason: ParsePricingRulesReason,
):
  | "pricingRulesInvalidJson"
  | "pricingRulesNotObject"
  | "pricingRulesTooLong"
  | "pricingRulesForbiddenKey"
  | "pricingRulesNonFiniteNumber" {
  switch (reason) {
    case "too_large":
      return "pricingRulesTooLong";
    case "not_object":
      return "pricingRulesNotObject";
    case "forbidden_key":
      return "pricingRulesForbiddenKey";
    case "non_finite_number":
      return "pricingRulesNonFiniteNumber";
    case "invalid_json":
    default:
      return "pricingRulesInvalidJson";
  }
}
