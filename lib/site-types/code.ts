import { normalizeLookupCode } from "@/lib/lookup-code";
import { SITE_TYPE_CODES } from "@/lib/site-rig-length";

/**
 * App-level cap for site type `code` (UTF-16 length after trim + uppercase).
 * Mirrored by `site_types_code_format` CHECK (length ≤ 64 + identifier).
 */
export const SITE_TYPE_CODE_MAX_LENGTH = 64;

/** Identifier shape after normalize (no spaces/punctuation; URL- and i18n-safe). */
export const SITE_TYPE_CODE_FORMAT = /^[A-Z][A-Z0-9_]*$/;

export type NormalizeSiteTypeCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "missing" | "too_long" | "invalid_format" };

/**
 * Trim, uppercase, length-cap, then enforce {@link SITE_TYPE_CODE_FORMAT}.
 */
export function normalizeSiteTypeCode(
  input: unknown,
): NormalizeSiteTypeCodeResult {
  const normalized = normalizeLookupCode(input, SITE_TYPE_CODE_MAX_LENGTH);
  if (!normalized.ok) {
    return normalized;
  }
  if (!SITE_TYPE_CODE_FORMAT.test(normalized.code)) {
    return { ok: false, reason: "invalid_format" };
  }
  return normalized;
}

/**
 * Seeded codes hard-coded in SQL (`sites_enforce_type_attributes`, search RPCs)
 * and guest filters (`GUEST_SITE_TYPE_CODES` ← {@link SITE_TYPE_CODES}).
 * Delete/rename protection reuses that same set — intentional coupling today;
 * see comment on `SITE_TYPE_CODES` in `lib/site-rig-length.ts`.
 */
const PROTECTED_SITE_TYPE_CODES = new Set<string>(SITE_TYPE_CODES);

/**
 * Seeded / hard-coded site type codes used by guest search, site forms, and
 * SQL `sites_enforce_type_attributes`. Block delete/rename like hookup amenities
 * (`protect_seeded_site_type_codes` trigger).
 */
export function isProtectedSiteTypeCode(
  code: string | undefined | null,
): boolean {
  return PROTECTED_SITE_TYPE_CODES.has((code ?? "").trim().toUpperCase());
}

/**
 * Locale-aware conjunction list of protected codes for admin copy (`{codes}`).
 * Pass a BCP 47 locale (e.g. `en-CA` / `fr-CA`) so fr gets "et", en gets "and".
 */
export function formatProtectedSiteTypeCodes(locale: string): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(
    SITE_TYPE_CODES,
  );
}
