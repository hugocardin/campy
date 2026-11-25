export {
  PROTECTED_HOOKUP_AMENITY_CODES,
  isProtectedHookupAmenityCode,
} from "./hookup-codes";
import { normalizeLookupCode } from "@/lib/lookup-code";

/**
 * App-level cap for amenity `code` (UTF-16 length after trim + uppercase).
 * Live `amenities.code` is unbounded `text` unless a later migration adds a
 * CHECK; keep this conservative so multi-MB payloads never hit insert.
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
  return normalizeLookupCode(input, AMENITY_CODE_MAX_LENGTH);
}
