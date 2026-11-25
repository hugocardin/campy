/**
 * Booking lifecycle lookup (`booking_statuses.name`).
 * Resolve status by name — do not hardcode `status_id` integers.
 *
 * MVP set (Phase D/F): pending → confirmed; cancelled / refunded.
 * Extra states (payment_failed, expired, completed, no_show, …) deferred.
 */

export const BOOKING_STATUS_NAMES = [
  "pending",
  "confirmed",
  "cancelled",
  "refunded",
] as const;

export type BookingStatusName = (typeof BOOKING_STATUS_NAMES)[number];

const NAME_SET = new Set<string>(BOOKING_STATUS_NAMES);

export function isBookingStatusName(
  value: string,
): value is BookingStatusName {
  return NAME_SET.has(value);
}

export function parseBookingStatusName(
  value: unknown,
): BookingStatusName | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (isBookingStatusName(trimmed)) return trimmed;
  return undefined;
}
