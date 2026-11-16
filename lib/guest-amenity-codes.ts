/**
 * Guest search park-amenity multi-select (issue #24 §3).
 * URL: `amenities=wifi,pet_friendly` (lowercase underscore tokens).
 * Match is park-level AND on `campground_amenities` (not same-site).
 * Water / sewer / dump / retired electricity stay on dedicated controls.
 *
 * Excluded keys must stay in sync with `normalize_guest_amenity_ids` in
 * `supabase/migrations/*search_amenities*`.
 *
 * Overflow policy (intentional split):
 * - This module dedupes, drops empty/excluded tokens, and sorts. It does
 *   **not** drop over-long tokens or truncate past {@link GUEST_AMENITY_CODES_MAX}.
 * - Fail-closed for over-long keys, >16 distinct keys, and raw cardinality >64
 *   lives in the RPC (`NULL` → zero parks). Crafted URLs therefore keep the
 *   bad tokens so `getCampgrounds` can pass them through and get zero rows,
 *   instead of silently turning the filter off or applying a subset.
 * - Normal UI checkbox paths never emit over-long or >16 selections.
 */
import { AMENITY_CODE_MAX_LENGTH } from "@/lib/amenities/code";
import { PROTECTED_HOOKUP_AMENITY_CODES } from "@/lib/amenities/hookup-codes";
import { codeToMessageKey } from "@/lib/translate-code";

/** Cap enforced by RPC `normalize_guest_amenity_ids` (abuse / DoS). */
export const GUEST_AMENITY_CODES_MAX = 16;

/**
 * Dedicated hookup / dump / retired codes — never emitted by this filter.
 * Hookups from {@link PROTECTED_HOOKUP_AMENITY_CODES}; ELECTRICITY retired (#26).
 */
const EXCLUDED_GUEST_AMENITY_KEYS = new Set<string>([
  ...PROTECTED_HOOKUP_AMENITY_CODES,
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
 * Dedupe + stable-sort by canonical key. Drops excluded / empty only.
 * Over-long and >{@link GUEST_AMENITY_CODES_MAX} distinct keys are preserved
 * so the RPC can fail closed (see file header).
 */
export function normalizeGuestAmenityCodes(
  codes: readonly string[] | undefined | null,
): string[] {
  if (codes == null || codes.length === 0) return [];
  const selected = new Set<string>();
  for (const raw of codes) {
    const key = amenityCodeCanonicalKey(String(raw));
    if (!key) continue;
    if (EXCLUDED_GUEST_AMENITY_KEYS.has(key)) continue;
    selected.add(key);
  }
  return [...selected].sort((a, b) => a.localeCompare(b));
}

/**
 * Parse `amenities` URL param: comma-separated tokens (case-insensitive).
 * Stores canonical keys (`PET_FRIENDLY`); RPC matches DB rows via the same key.
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

/**
 * Checkbox options: catalog codes (deduped by canonical key) plus any
 * URL-only selected keys so stale filters stay visible/clearable.
 */
export function guestAmenityOptionsFromCatalogAndSelection(
  catalog: readonly { code: string }[],
  selectedKeys: readonly string[],
): { code: string }[] {
  const seen = new Set<string>();
  const options: { code: string }[] = [];
  for (const row of guestSearchAmenityCatalog(catalog)) {
    const key = amenityCodeCanonicalKey(row.code);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ code: row.code });
  }
  for (const key of normalizeGuestAmenityCodes(selectedKeys)) {
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ code: key });
  }
  return options;
}
