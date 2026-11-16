/**
 * Guest search park-amenity multi-select (issue #24 §3).
 * URL: `amenities=wifi,pet_friendly` (lowercase underscore tokens).
 * Match is park-level AND on `campground_amenities` (not same-site).
 * Water / sewer / dump / retired electricity stay on dedicated controls.
 */
import { AMENITY_CODE_MAX_LENGTH } from "@/lib/amenities/code";
import { codeToMessageKey } from "@/lib/translate-code";

/** Cap aligned with RPC `normalize_guest_amenity_codes` (abuse / DoS). */
export const GUEST_AMENITY_CODES_MAX = 16;

/** Dedicated hookup / dump / retired codes — never emitted by this filter. */
const EXCLUDED_GUEST_AMENITY_KEYS = new Set([
  "WATER",
  "SEWER",
  "DUMP_STATION",
  "ELECTRICITY",
]);

/** Canonical key: `PET FRIENDLY` / `pet-friendly` → `PET_FRIENDLY`. */
export function amenityCodeCanonicalKey(code: string): string {
  return codeToMessageKey(code);
}

export function isExcludedGuestSearchAmenity(code: string): boolean {
  const key = amenityCodeCanonicalKey(code);
  return key.length > 0 && EXCLUDED_GUEST_AMENITY_KEYS.has(key);
}

/** True when code is usable as a guest park-amenity filter (not excluded). */
export function isGuestSearchAmenityCode(code: string): boolean {
  const key = amenityCodeCanonicalKey(code);
  if (!key || key.length > AMENITY_CODE_MAX_LENGTH) return false;
  return !EXCLUDED_GUEST_AMENITY_KEYS.has(key);
}

/**
 * Dedupe + stable-sort by canonical key. Drops excluded / empty / oversized.
 * Caps at {@link GUEST_AMENITY_CODES_MAX}.
 */
export function normalizeGuestAmenityCodes(
  codes: readonly string[] | undefined | null,
): string[] {
  if (codes == null || codes.length === 0) return [];
  const selected = new Set<string>();
  for (const raw of codes) {
    const key = amenityCodeCanonicalKey(String(raw));
    if (!key || key.length > AMENITY_CODE_MAX_LENGTH) continue;
    if (EXCLUDED_GUEST_AMENITY_KEYS.has(key)) continue;
    selected.add(key);
    if (selected.size >= GUEST_AMENITY_CODES_MAX) break;
  }
  return [...selected].sort((a, b) => a.localeCompare(b));
}

/**
 * Parse `amenities` URL param: comma-separated tokens (case-insensitive).
 * Stores canonical keys (`PET_FRIENDLY`); RPC matches DB codes via the same key.
 */
export function parseGuestAmenityCodes(
  value: string | undefined | null,
): string[] {
  if (value == null || value.trim() === "") return [];
  const parts = value.split(",").map((part) => part.trim());
  return normalizeGuestAmenityCodes(parts);
}

/** Serialize for URL (`wifi,pet_friendly`). Empty → omit. */
export function formatGuestAmenityCodesParam(
  codes: readonly string[] | undefined | null,
): string | undefined {
  const normalized = normalizeGuestAmenityCodes(codes);
  if (normalized.length === 0) return undefined;
  return normalized.map((c) => c.toLowerCase()).join(",");
}

/** Filter an amenity catalog row list down to guest-search checkboxes. */
export function guestSearchAmenityCatalog<T extends { code: string }>(
  amenities: readonly T[],
): T[] {
  return amenities.filter((a) => isGuestSearchAmenityCode(a.code));
}
