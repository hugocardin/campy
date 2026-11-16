/**
 * Guest profile field rules (Phase B).
 * Keep {@link FULL_NAME_MAX_LENGTH} in sync with
 * `profiles_full_name_len_chk` in
 * `supabase/migrations/20261116064012_profiles_edit_constraints_updated_at.sql`.
 * Keep rig max in sync with {@link RIG_LENGTH_MAX_FT} /
 * `profiles_default_rig_length_chk` in that same migration.
 */
export const FULL_NAME_MAX_LENGTH = 120;

/**
 * Normalize a person name for storage / required checks:
 * NFC, strip control + format chars, collapse whitespace, trim.
 */
export function normalizePersonName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
