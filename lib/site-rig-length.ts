/**
 * Site-type rules for `max_rig_length` (issue #27).
 * Keep in sync with SQL `site_max_rig_length_valid`
 * (`supabase/migrations/20261116021437_dump_driveway_rig_search.sql`).
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
