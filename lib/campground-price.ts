/**
 * Guest max-price / currency helpers (issue #24).
 * Amounts are nightly **base** prices (`sites.price_per_night_base`) in the
 * parent `campgrounds.currency` (CAD / USD / MXN). No FX conversion — maxPrice
 * is scoped to one currency; price sort alone does **not** hide other
 * currencies (#51). `pricing_rules` effective prices stay Phase D / later.
 * RPC rejects ≤0 and > {@link GUEST_MAX_PRICE_CAP}.
 *
 * Keep {@link GUEST_PRICE_CURRENCIES} in sync with SQL
 * `public.normalize_listing_currency` (TS pin in tests; SQL probe in
 * `supabase/probes/search-multi-currency.md`).
 */

/** Default listing / filter currency (Canada-first catalog). */
export const GUEST_PRICE_CURRENCY = "CAD";

/**
 * Guest-supported listing currencies.
 * Must match `normalize_listing_currency` / `campgrounds_currency_check`.
 */
export const GUEST_PRICE_CURRENCIES = ["CAD", "USD", "MXN"] as const;

export type GuestPriceCurrency = (typeof GUEST_PRICE_CURRENCIES)[number];

/** Upper bound accepted by search RPCs / URL parsers. */
export const GUEST_MAX_PRICE_CAP = 100_000;

const GUEST_PRICE_CURRENCY_SET = new Set<string>(GUEST_PRICE_CURRENCIES);

/**
 * Parse URL / form `currency` — CAD / USD / MXN (case-insensitive), else undefined.
 */
export function parseGuestPriceCurrency(
  value: string | undefined | null,
): GuestPriceCurrency | undefined {
  if (value == null || value === "") return undefined;
  const code = String(value).trim().toUpperCase();
  if (!GUEST_PRICE_CURRENCY_SET.has(code)) return undefined;
  return code as GuestPriceCurrency;
}

export function formatGuestPriceCurrencyParam(
  value: GuestPriceCurrency | undefined | null,
): string | undefined {
  return parseGuestPriceCurrency(value ?? undefined);
}

/**
 * Normalize a campground/RPC currency for display — unknown → CAD default.
 */
export function resolveCampgroundPriceCurrency(
  value: string | null | undefined,
): GuestPriceCurrency {
  return parseGuestPriceCurrency(value) ?? GUEST_PRICE_CURRENCY;
}

/**
 * Currency to send as RPC `filter_currency`.
 * - With maxPrice: scopes results to that currency (default CAD).
 * - With price sort alone: preference only — RPC groups that currency first
 *   then sorts within each currency (does **not** hide other parks) — #51.
 */
export function resolveGuestPriceCurrencyFilter(options: {
  currency?: GuestPriceCurrency;
  maxPrice?: number;
  /** When `price` / `price-desc`, send preference even without maxPrice. */
  sort?: string;
}): GuestPriceCurrency | undefined {
  const priceSort = options.sort === "price" || options.sort === "price-desc";
  if (options.maxPrice == null && !priceSort) return undefined;
  return options.currency ?? GUEST_PRICE_CURRENCY;
}

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

export type FormatCampgroundPriceOptions = {
  /** Force fraction digits (e.g. 2 for aligned tables). Default: 0 for whole amounts. */
  fractionDigits?: number;
};

/**
 * Format a nightly **base** price for cards / controls.
 * Pass the park's listing currency when known.
 */
export function formatCampgroundPricePerNight(
  amount: number | null | undefined,
  locale: string,
  currency: string = GUEST_PRICE_CURRENCY,
  options?: FormatCampgroundPriceOptions,
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const code = resolveCampgroundPriceCurrency(currency);
  const fractionDigits =
    options?.fractionDigits ?? (amount % 1 === 0 ? 0 : 2);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
