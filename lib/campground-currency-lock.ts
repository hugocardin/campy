/**
 * Park listing-currency lock (#24 / parked from #51).
 *
 * Changing `campgrounds.currency` reinterprets every existing
 * `sites.price_per_night_base` (and later booking amounts) with no FX.
 * Once a park has sites, or any booking that stores amounts, currency is
 * hard-blocked (DB trigger + server-action check).
 */

export const CAMPGROUND_CURRENCY_LOCK_REASONS = ["sites", "bookings"] as const;

export type CampgroundCurrencyLockReason =
  (typeof CAMPGROUND_CURRENCY_LOCK_REASONS)[number];

/** Entity-namespaced field for ActionResult when currency is locked. */
export const CAMPGROUND_CURRENCY_LOCKED_FIELD = "campground.currencyLocked";

/** Distinctive fragment in the DB trigger message (map 23514 → lock). */
export const CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER =
  "campground_currency_locked";

export function isCampgroundCurrencyLockReason(
  value: unknown,
): value is CampgroundCurrencyLockReason {
  return (
    value === "sites" || value === "bookings"
  );
}

/**
 * Prefer sites when both apply (demo parks today). Bookings-only is rare
 * until Phase D, but the booking guard is wired now.
 */
export function resolveCampgroundCurrencyLockReason(options: {
  hasSites: boolean;
  hasAmountBookings: boolean;
}): CampgroundCurrencyLockReason | null {
  if (options.hasSites) return "sites";
  if (options.hasAmountBookings) return "bookings";
  return null;
}

/** Parse trigger / PostgREST message → lock reason (null if unrelated). */
export function parseCampgroundCurrencyLockMessage(
  message: string | null | undefined,
): CampgroundCurrencyLockReason | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (!lower.includes(CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER)) {
    return null;
  }
  if (lower.includes(":bookings") || lower.includes(" bookings")) {
    return "bookings";
  }
  if (lower.includes(":sites") || lower.includes(" sites")) {
    return "sites";
  }
  // Marker present but reason unknown — treat as sites (strictest common case).
  return "sites";
}
