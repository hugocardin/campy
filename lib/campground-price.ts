/**
 * Guest max-price filter helpers (issue #24).
 * Canonical unit: currency amount per night (CAD in seed data).
 * RPC rejects ≤0 and > {@link GUEST_MAX_PRICE_CAP}.
 */

/** Upper bound accepted by search RPCs / URL parsers. */
export const GUEST_MAX_PRICE_CAP = 100_000;

/**
 * Parse URL `maxPrice` — positive finite number ≤ cap, else undefined.
 * Rejects zero / negative / non-numeric junk.
 */
export function parseGuestMaxPrice(
  value: string | number | undefined | null,
): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0 || n > GUEST_MAX_PRICE_CAP) {
    return undefined;
  }
  // Keep cents when present; strip float noise beyond 2 decimals.
  return Math.round(n * 100) / 100;
}

export function formatGuestMaxPriceParam(
  value: number | undefined | null,
): string | undefined {
  const parsed = parseGuestMaxPrice(value ?? undefined);
  if (parsed == null) return undefined;
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

/**
 * Format a nightly price for cards / controls (CAD).
 * Returns null when missing / non-finite.
 */
export function formatCampgroundPricePerNight(
  amount: number | null | undefined,
  locale: string,
  currency = "CAD",
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
