/**
 * App-level cap for amenity `code` (UTF-16 length after trim + uppercase).
 * DB column limit is not in-repo (no migrations); keep this conservative so
 * multi-MB payloads never hit insert.
 */
export const AMENITY_CODE_MAX_LENGTH = 64;

export type NormalizeAmenityCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim, uppercase, then enforce length on the normalized value so characters
 * that expand when uppercased (`ß` → `SS`) cannot bypass the cap.
 */
export function normalizeAmenityCode(
  input: unknown,
): NormalizeAmenityCodeResult {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "missing" };
  }
  const code = trimmed.toUpperCase();
  if (code.length > AMENITY_CODE_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, code };
}
