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

/** Guest filter / form absurd-value caps (issue #32). */
export const RIG_LENGTH_MAX_FT = 200;
/** ≈ 200 ft (200 × 0.3048 = 60.96 → 61). */
export const RIG_LENGTH_MAX_M = 61;

export const RIG_LENGTH_UNITS = ["ft", "m"] as const;
export type RigLengthUnit = (typeof RIG_LENGTH_UNITS)[number];

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

/** Round for display / storage. Metres use 2 decimals to limit ft↔m drift. */
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
 * Parse a display-unit value and return canonical **feet** for storage / URL /
 * RPC. Applies the cap in the chosen unit (200 ft ≈ 61 m). Invalid / over-cap
 * → undefined.
 */
export function parseGuestRigLength(
  value: string | number | undefined | null,
  unit: RigLengthUnit = "ft",
): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n > maxRigLengthInUnit(unit)) return undefined;
  if (unit === "m") {
    // Two-decimal feet when converting from metres (keeps ~cm precision).
    return roundRigLength(metresToFeet(n), 2);
  }
  return n;
}

export function formatGuestRigLengthParam(
  value: number | undefined,
): string | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  // Keep up to 2 decimals (metres→feet); strip trailing zeros via Number.
  const rounded = roundRigLength(value, 2);
  return String(rounded);
}
