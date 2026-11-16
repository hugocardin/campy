/**
 * Amenity `code` values used by guest water/sewer search filters.
 * Electricity is site `electricity_amps` (issue #26), not an amenity code.
 * Must stay in sync with RPC hardcoded codes and schema seed.
 */
export const PROTECTED_HOOKUP_AMENITY_CODES = [
  "WATER",
  "SEWER",
] as const;

export type ProtectedHookupAmenityCode =
  (typeof PROTECTED_HOOKUP_AMENITY_CODES)[number];

const PROTECTED_SET = new Set<string>(PROTECTED_HOOKUP_AMENITY_CODES);

export function isProtectedHookupAmenityCode(code: string): boolean {
  return PROTECTED_SET.has(code.trim().toUpperCase());
}
