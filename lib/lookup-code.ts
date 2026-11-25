/**
 * Shared normalize for lookup `code` columns (amenities, site types, …).
 *
 * Live columns are unbounded `text` with no length CHECK unless a table-specific
 * migration adds one — this app cap is the primary guard against oversized
 * payloads. Per-table format rules (e.g. site types) layer on after this.
 */
export type NormalizeLookupCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim, uppercase, then enforce length on the normalized value so characters
 * that expand when uppercased (`ß` → `SS`) cannot bypass the cap.
 */
export function normalizeLookupCode(
  input: unknown,
  maxLength: number,
): NormalizeLookupCodeResult {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "missing" };
  }
  const code = trimmed.toUpperCase();
  if (code.length > maxLength) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, code };
}
