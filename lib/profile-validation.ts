/**
 * Guest profile field rules (Phase B).
 * Keep {@link FULL_NAME_MAX_LENGTH} in sync with
 * `profiles_full_name_len_chk` in
 * `supabase/migrations/20261116063554_profiles_edit_constraints_updated_at.sql`
 * (tightened in `20261116064207_profiles_full_name_check_tighten.sql`).
 * Keep rig max in sync with {@link RIG_LENGTH_MAX_FT} /
 * `profiles_default_rig_length_chk` in that same migration.
 * `preferred_rig_unit` CHECK (`ft`/`m`/NULL) lives in
 * `supabase/migrations/20261116135119_preferred_rig_unit.sql`.
 */
export const FULL_NAME_MAX_LENGTH = 120;

/** ZWNJ / ZWJ — keep for Indic/Persian spelling and emoji ZWJ sequences. */
const KEEP_FORMAT_CHARS = new Set(["\u200C", "\u200D"]);

/**
 * Normalize a person name for storage / required checks:
 * NFC, strip control chars and most format chars (keep ZWJ/ZWNJ),
 * collapse whitespace, trim. Returns "" when nothing visible remains
 * (ZWJ/ZWNJ-only names are rejected).
 */
export function normalizePersonName(raw: string): string {
  const normalized = raw
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .replace(/\p{Cf}/gu, (ch) => (KEEP_FORMAT_CHARS.has(ch) ? ch : ""))
    .replace(/\s+/g, " ")
    .trim();

  const visible = normalized.replace(/[\u200C\u200D]/g, "").trim();
  if (!visible) return "";
  return normalized;
}
