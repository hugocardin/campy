/**
 * Amenity `code` values used by guest electricity/water/sewer search filters.
 * Must stay in sync with RPC hardcoded codes and schema seed.
 */
export const PROTECTED_HOOKUP_AMENITY_CODES = [
  "ELECTRICITY",
  "WATER",
  "SEWER",
] as const;

export type ProtectedHookupAmenityCode =
  (typeof PROTECTED_HOOKUP_AMENITY_CODES)[number];

const PROTECTED_SET = new Set<string>(PROTECTED_HOOKUP_AMENITY_CODES);

export function isProtectedHookupAmenityCode(code: string): boolean {
  return PROTECTED_SET.has(code.trim().toUpperCase());
}
