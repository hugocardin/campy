import "server-only";

import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";

export type MyBookingsCount = {
  /** Rows for this user when the query succeeds. */
  count: number;
  /**
   * True when the read errored (missing grants / schema / transport) or threw.
   * Note: an RLS policy denial returns 0 rows with `error: null`, not this flag.
   * TODO(#55): harden bookings RLS before booking writes; pair with a seeded
   * owner-visibility probe when the list ships.
   */
  unavailable: boolean;
};

/**
 * Count the signed-in user's `bookings` rows.
 *
 * Filters by `user_id` in the app. Does not broaden grants. On hard failures
 * returns `{ count: 0, unavailable: true }` so the page can show a neutral
 * “couldn't load” state instead of claiming there are no reservations.
 */
export async function countMyBookings(
  userId: string,
): Promise<MyBookingsCount> {
  try {
    const supabase = await createClient();

    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      handleUnexpectedError(error);
      return { count: 0, unavailable: true };
    }

    return { count: count ?? 0, unavailable: false };
  } catch (err) {
    handleUnexpectedError(err);
    return { count: 0, unavailable: true };
  }
}
