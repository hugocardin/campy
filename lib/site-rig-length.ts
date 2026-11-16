/**
 * Site-type rules and guest/admin rig-length units (issues #27 / #32).
 *
 * Canonical storage is **feet** on `sites.max_rig_length` (and guest URL
 * `rigLength`). Metres are a display / input unit only; convert at the edge.
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
 * Format a canonical feet value for an input in the chosen unit.
 * Empty when feet is missing / invalid.
 */
export function formatRigLengthForDisplay(
  feet: number | undefined | null,
  unit: RigLengthUnit,
): string {
  if (feet == null || !Number.isFinite(feet) || feet <= 0) return "";
  if (unit === "ft") return String(roundRigLength(feet, 1));
  return String(roundRigLength(feetToMetres(feet), 2));
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
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
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
