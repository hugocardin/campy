/**
 * Park listing-currency lock (#24 / parked from #51).
 *
 * Changing `campgrounds.currency` reinterprets every existing
 * `sites.price_per_night_base` (and later booking amounts) with no FX.
 * Hard-blocked in DB via `campground_currency_lock_reason` + trigger.
 *
 * Reasons must match SQL `campground_currency_lock_reason` / EXCEPTION DETAIL.
 */

export const CAMPGROUND_CURRENCY_LOCK_REASONS = [
  "sites",
  "bookings",
] as const;

export type CampgroundCurrencyLockReason =
  (typeof CAMPGROUND_CURRENCY_LOCK_REASONS)[number];

/** UI / edit-page state: real lock reason, or probe failure (fail closed). */
export type CampgroundCurrencyLockState =
  | CampgroundCurrencyLockReason
  | "unknown";

/** Entity-namespaced field for ActionResult when currency is locked. */
export const CAMPGROUND_CURRENCY_LOCKED_FIELD = "campground.currencyLocked";

/** Distinctive fragment in the DB trigger message (map 23514 → lock). */
export const CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER =
  "campground_currency_locked";

/** Exact SQL message shapes from protect_campground_currency_change (pin). */
export const CAMPGROUND_CURRENCY_LOCK_SQL_MESSAGES = {
  sites: `${CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER}:sites — cannot change listing currency (no FX)`,
  bookings: `${CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER}:bookings — cannot change listing currency (no FX)`,
} as const;

const LOCK_REASON_FROM_DETAIL =
  /^(sites|bookings)$/;

const LOCK_REASON_FROM_MESSAGE =
  /campground_currency_locked:(sites|bookings)\b/;

export function isCampgroundCurrencyLockReason(
  value: unknown,
): value is CampgroundCurrencyLockReason {
  return value === "sites" || value === "bookings";
}

/**
 * Prefer bookings when both apply (more specific; FK is ON DELETE RESTRICT
 * so amount-bookings outlive accidental site deletes).
 */
export function resolveCampgroundCurrencyLockReason(options: {
  hasSites: boolean;
  hasAmountBookings: boolean;
}): CampgroundCurrencyLockReason | null {
  if (options.hasAmountBookings) return "bookings";
  if (options.hasSites) return "sites";
  return null;
}

/**
 * Parse PostgREST trigger error → lock reason.
 * Prefer structured `details` (EXCEPTION DETAIL); fall back to exact message.
 */
export function parseCampgroundCurrencyLockError(options: {
  message?: string | null;
  details?: string | null;
}): CampgroundCurrencyLockReason | null {
  const detail = options.details?.trim();
  if (detail && LOCK_REASON_FROM_DETAIL.test(detail)) {
    return detail as CampgroundCurrencyLockReason;
  }

  if (!options.message) return null;
  const match = options.message.match(LOCK_REASON_FROM_MESSAGE);
  if (!match?.[1]) return null;
  return match[1] as CampgroundCurrencyLockReason;
}

/** @deprecated use parseCampgroundCurrencyLockError */
export function parseCampgroundCurrencyLockMessage(
  message: string | null | undefined,
): CampgroundCurrencyLockReason | null {
  return parseCampgroundCurrencyLockError({ message });
}
