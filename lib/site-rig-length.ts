/**
 * Site-type rules for `max_rig_length` (issue #27).
 * Keep in sync with SQL `sites_enforce_type_attributes`
 * (`supabase/migrations/20261116024448_*` / `20261116024947_*`).
 * Codes are duplicated in SQL/TS intentionally for now;
 * a `site_types` flag column can centralize later.
 *
 * Guest `min_rig` matching a TENT site that has optional max_rig_length set is
 * intentional (same-site capacity), not limited to RV / RV_AND_TENT.
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

export function isLodgingSiteType(code: string | undefined | null): boolean {
  return (code ?? "").trim().toUpperCase() === "LODGING";
}

export function siteTypeRequiresMaxRigLength(
  code: string | undefined | null,
): boolean {
  return REQUIRES_MAX_RIG.has((code ?? "").trim().toUpperCase());
}

/** Guest rig length URL / form: positive finite number, else undefined. */
export function parseGuestRigLength(
  value: string | number | undefined | null,
): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Cap absurd values (feet).
  if (n > 200) return undefined;
  return n;
}

export function formatGuestRigLengthParam(
  value: number | undefined,
): string | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  return String(value);
}
