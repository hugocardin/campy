/**
 * Site-type rules and guest/admin rig-length units (issues #27 / #32).
 *
 * Canonical storage is **feet** on `sites.max_rig_length` (and guest URL
 * `rigLength`). Metres are a display / input unit only; convert at the edge.
 * Site-card / admin read views use {@link formatRigLength} (dual ft + m).
 *
 * Keep site-type rules in sync with SQL `sites_enforce_type_attributes`
 * (`supabase/migrations/20261116024448_*` / `20261116024947_*`).
 * Codes are duplicated in SQL/TS intentionally for now;
 * a `site_types` flag column can centralize later.
 *
 * Guest `min_rig` matching a TENT site that has optional max_rig_length set is
 * intentional (same-site capacity), not limited to RV / RV_AND_TENT.
 *
 * URL params (guest search):
 * - `rigLength=<feet>` — always canonical feet (same as DB / RPC `min_rig_length`)
 * - `rigUnit=m` — optional; omit or `ft` means feet. Controls the filter toggle
 *   and how the input is shown; does not change the numeric meaning of `rigLength`.
 */
export const SITE_TYPE_CODES = [
  "TENT",
  "RV",
  "RV_AND_TENT",
  "LODGING",
] as const;

export type SiteTypeCode = (typeof SITE_TYPE_CODES)[number];

/** Types that require a positive max_rig_length. */
export const SITE_TYPES_REQUIRING_MAX_RIG = ["RV", "RV_AND_TENT"] as const;

export type SiteTypeRequiringMaxRig =
  (typeof SITE_TYPES_REQUIRING_MAX_RIG)[number];

const REQUIRES_MAX_RIG = new Set<string>(SITE_TYPES_REQUIRING_MAX_RIG);

/** International foot (exact). */
export const METRES_PER_FOOT = 0.3048;

/** Single absurd-value / guest-filter / admin-write cap (canonical feet). */
export const RIG_LENGTH_MAX_FT = 200;

/**
 * Metre input max derived from {@link RIG_LENGTH_MAX_FT} (2-decimal floor),
 * so converting max metres never exceeds the feet cap.
 * 200 × 0.3048 = 60.96.
 */
export const RIG_LENGTH_MAX_M =
  Math.floor(RIG_LENGTH_MAX_FT * METRES_PER_FOOT * 100) / 100;

export const RIG_LENGTH_UNITS = ["ft", "m"] as const;
export type RigLengthUnit = (typeof RIG_LENGTH_UNITS)[number];

export type ParseRigLengthFailureReason = "empty" | "invalid" | "over_max";

export type ParseRigLengthResult =
  | { ok: true; feet: number }
  | { ok: false; reason: ParseRigLengthFailureReason };

export function isLodgingSiteType(code: string | undefined | null): boolean {
  return (code ?? "").trim().toUpperCase() === "LODGING";
}

export function siteTypeRequiresMaxRigLength(
  code: string | undefined | null,
): boolean {
  return REQUIRES_MAX_RIG.has((code ?? "").trim().toUpperCase());
}

export function maxRigLengthInUnit(unit: RigLengthUnit): number {
  return unit === "m" ? RIG_LENGTH_MAX_M : RIG_LENGTH_MAX_FT;
}

/** Parse `rigUnit` URL / form value; default feet. */
export function parseRigLengthUnit(
  value: string | undefined | null,
): RigLengthUnit {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    raw === "m" ||
    raw === "metre" ||
    raw === "meter" ||
    raw === "metres" ||
    raw === "meters"
  ) {
    return "m";
  }
  return "ft";
}

/** Emit `rigUnit` only when metres (feet is the default / omitted). */
export function formatRigLengthUnitParam(
  unit: RigLengthUnit | undefined,
): string | undefined {
  return unit === "m" ? "m" : undefined;
}

export function feetToMetres(feet: number): number {
  return feet * METRES_PER_FOOT;
}

export function metresToFeet(metres: number): number {
  return metres / METRES_PER_FOOT;
}

/** Round for display / storage. Metres use 2 decimals; feet use 1. */
export function roundRigLength(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convert a finite display value between units.
 * Returns undefined when the input is not a positive finite number.
 */
export function convertRigLengthDisplay(
  value: number,
  from: RigLengthUnit,
  to: RigLengthUnit,
): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (from === to) {
    return roundRigLength(value, from === "m" ? 2 : 1);
  }
  if (from === "ft" && to === "m") {
    return roundRigLength(feetToMetres(value), 2);
  }
  return roundRigLength(metresToFeet(value), 1);
}

/**
 * Parse a display decimal that may use `,` or `.` as the separator
 * (fr-CA guests type `10,67`). Rejects mixed/multiple separators and
 * non-decimal `Number()` forms (`0x…`, `1e2`, `+5`, …).
 */
export function parseDecimalInput(
  value: string | number | undefined | null,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const trimmed = String(value).trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  // Digits with at most one decimal separator; optional trailing separator.
  if (!/^\d*[.,]?\d+$|^\d+[.,]$/.test(trimmed)) return undefined;

  const commaCount = (trimmed.match(/,/g) ?? []).length;
  const dotCount = (trimmed.match(/\./g) ?? []).length;
  if (commaCount + dotCount > 1) return undefined;
  if (commaCount > 0 && dotCount > 0) return undefined;

  const normalized = commaCount === 1 ? trimmed.replace(",", ".") : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convert a typed draft string when the ft/m toggle flips.
 * Empty / unparsable drafts are left unchanged (strict decimal parse).
 * Pass `locale` so fr-CA keeps a decimal comma after conversion.
 */
export function convertRigDraftOnUnitChange(
  draft: string,
  from: RigLengthUnit,
  to: RigLengthUnit,
  locale?: string,
): string {
  if (from === to) return draft;
  const trimmed = draft.trim();
  if (trimmed === "") return draft;
  const n = parseDecimalInput(trimmed);
  if (n == null || n <= 0) return draft;
  const converted = convertRigLengthDisplay(n, from, to);
  if (converted == null) return draft;
  if (locale) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: to === "m" ? 2 : 1,
      useGrouping: false,
    }).format(converted);
  }
  return String(converted);
}

/**
 * Format a canonical feet value for an input in the chosen unit.
 * Empty when feet is missing / invalid.
 * Pass `locale` so fr-CA drafts use a decimal comma (matches typed input).
 */
export function formatRigLengthForDisplay(
  feet: number | undefined | null,
  unit: RigLengthUnit,
  locale?: string,
): string {
  if (feet == null || !Number.isFinite(feet) || feet <= 0) return "";
  const value =
    unit === "ft"
      ? roundRigLength(feet, 1)
      : roundRigLength(feetToMetres(feet), 2);
  if (locale) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: unit === "m" ? 2 : 1,
      useGrouping: false,
    }).format(value);
  }
  return String(value);
}

export type FormatRigLengthLabels = {
  /** Localized feet label (`ft` / `pi`). */
  ft: string;
  /** Localized metres label (`m`). */
  m: string;
};

export type FormatRigLengthOptions = {
  labels: FormatRigLengthLabels;
  /**
   * BCP 47 locale for decimal separators (e.g. `en-CA` / `fr-CA`).
   * When omitted, uses JS default `.` (fine for unit tests).
   */
  locale?: string;
  /**
   * Leading unit; the other is shown in parentheses.
   * Default `"ft"` (canonical storage). Guest pages may pass `rigUnit`.
   */
  primaryUnit?: RigLengthUnit;
};

/**
 * Format canonical feet for site cards / admin read views (issue #34).
 * Always shows both units:
 * - feet to **1** decimal (storage / parse precision)
 * - metres to **2** decimals (same as {@link formatRigLengthForDisplay} /
 *   {@link convertRigLengthDisplay}) so a max-length label never overstates
 *   capacity vs the guest filter (e.g. 36 ft → `10.97 m`, not `11 m`)
 *
 * Numbers are locale-formatted when `locale` is set (`36,1` in fr-CA).
 * Returns `null` when feet is missing / non-finite / rounds to ≤ 0.
 */
export function formatRigLength(
  feet: number | undefined | null,
  options: FormatRigLengthOptions,
): string | null {
  if (feet == null || !Number.isFinite(feet)) return null;
  const ft = roundRigLength(feet, 1);
  // Match parseRigLengthToFeet: reject values that round to 0.
  if (ft <= 0) return null;
  const m = roundRigLength(feetToMetres(feet), 2);
  const { labels, primaryUnit = "ft", locale } = options;
  const formatNumber = (value: number, maxFractionDigits: number) =>
    locale
      ? new Intl.NumberFormat(locale, {
          maximumFractionDigits: maxFractionDigits,
        }).format(value)
      : String(value);
  const ftPart = `${formatNumber(ft, 1)} ${labels.ft}`;
  const mPart = `${formatNumber(m, 2)} ${labels.m}`;
  return primaryUnit === "m" ? `${mPart} (${ftPart})` : `${ftPart} (${mPart})`;
}

/**
 * Parse a display-unit value to canonical **feet**.
 * Cap is always checked in feet after conversion (so metre max cannot exceed
 * {@link RIG_LENGTH_MAX_FT}). Metres→feet rounds to 1 decimal to keep
 * ft→m→ft round-trips from excluding equal-length sites.
 */
export function parseRigLengthToFeet(
  value: string | number | undefined | null,
  unit: RigLengthUnit = "ft",
): ParseRigLengthResult {
  if (value == null || value === "") {
    return { ok: false, reason: "empty" };
  }
  if (typeof value === "string" && value.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  const n = parseDecimalInput(value);
  if (n == null || n <= 0) {
    return { ok: false, reason: "invalid" };
  }
  const feet =
    unit === "m" ? roundRigLength(metresToFeet(n), 1) : roundRigLength(n, 1);
  // Reject values that round to 0 (e.g. 0.04 ft) — positivity must hold after
  // the 1-decimal round, not only on the raw input.
  if (feet <= 0) {
    return { ok: false, reason: "invalid" };
  }
  if (feet > RIG_LENGTH_MAX_FT) {
    return { ok: false, reason: "over_max" };
  }
  return { ok: true, feet };
}

/**
 * Guest URL / filter helper: positive finite feet, else undefined.
 * Prefer {@link parseRigLengthToFeet} when callers need empty vs over-max.
 */
export function parseGuestRigLength(
  value: string | number | undefined | null,
  unit: RigLengthUnit = "ft",
): number | undefined {
  const parsed = parseRigLengthToFeet(value, unit);
  return parsed.ok ? parsed.feet : undefined;
}

/**
 * Normalize a server-side feet value (already canonical). Caps / rounds like
 * {@link parseRigLengthToFeet} with unit `ft`.
 */
export function normalizeStoredRigLengthFeet(
  value: number | undefined | null,
): ParseRigLengthResult {
  if (value == null) return { ok: false, reason: "empty" };
  return parseRigLengthToFeet(value, "ft");
}

export function formatGuestRigLengthParam(
  value: number | undefined,
): string | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return String(roundRigLength(value, 1));
}
