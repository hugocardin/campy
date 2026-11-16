/**
 * Amenity `code` values used by guest search filters (must not be deleted/renamed).
 * Electricity is site `electricity_amps` (issue #26), not an amenity code.
 * DUMP_STATION is campground-level (issue #27).
 * Must stay in sync with RPC hardcoded codes and `protect_hookup_amenity_codes`.
 */
export const PROTECTED_HOOKUP_AMENITY_CODES = [
  "WATER",
  "SEWER",
  "DUMP_STATION",
] as const;

/** Water/sewer only — site same-site hookup filters. */
export const SITE_HOOKUP_AMENITY_CODES = ["WATER", "SEWER"] as const;

export type SiteHookupAmenityCode = (typeof SITE_HOOKUP_AMENITY_CODES)[number];

export type ProtectedHookupAmenityCode =
  (typeof PROTECTED_HOOKUP_AMENITY_CODES)[number];

const PROTECTED_SET = new Set<string>(PROTECTED_HOOKUP_AMENITY_CODES);

export function isProtectedHookupAmenityCode(code: string): boolean {
  return PROTECTED_SET.has(code.trim().toUpperCase());
}
