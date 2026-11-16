/**
 * Guest max-price filter helpers (issue #24).
 * MVP: amounts are **CAD base** nightly prices (`sites.price_per_night_base`).
 * Multi-currency and `pricing_rules` effective prices are Phase D / later.
 * RPC rejects ≤0 and > {@link GUEST_MAX_PRICE_CAP}.
 */

/** Display / compare currency until campgrounds carry a currency column. */
export const GUEST_PRICE_CURRENCY = "CAD";

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
 * Format a nightly **base** price for cards / controls ({@link GUEST_PRICE_CURRENCY}).
 * Returns null when missing / non-finite.
 */
export function formatCampgroundPricePerNight(
  amount: number | null | undefined,
  locale: string,
  currency = GUEST_PRICE_CURRENCY,
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const fractionDigits = amount % 1 === 0 ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
