import { SITE_TYPE_CODES } from "@/lib/site-rig-length";

/**
 * App-level cap for site type `code` (UTF-16 length after trim + uppercase).
 * Mirrors amenity codes; DB column limit is not in-repo.
 */
export const SITE_TYPE_CODE_MAX_LENGTH = 64;

export type NormalizeSiteTypeCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim, uppercase, then enforce length on the normalized value so characters
 * that expand when uppercased (`ß` → `SS`) cannot bypass the cap.
 */
export function normalizeSiteTypeCode(
  input: unknown,
): NormalizeSiteTypeCodeResult {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "missing" };
  }
  const code = trimmed.toUpperCase();
  if (code.length > SITE_TYPE_CODE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, code };
}

const PROTECTED_SITE_TYPE_CODES = new Set<string>(SITE_TYPE_CODES);

/**
 * Seeded / hard-coded site type codes used by guest search, site forms, and
 * SQL `sites_enforce_type_attributes`. Block delete like hookup amenities.
 */
export function isProtectedSiteTypeCode(
  code: string | undefined | null,
): boolean {
  return PROTECTED_SITE_TYPE_CODES.has((code ?? "").trim().toUpperCase());
}
