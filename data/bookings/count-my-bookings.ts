import "server-only";

import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";

export type MyBookingsCount = {
  /** Rows for this user when the query succeeds. */
  count: number;
  /**
   * True when PostgREST rejected the read (RLS/grants/schema) or threw.
   * Callers should still treat the UI as empty; Phase D must harden bookings RLS.
   */
  unavailable: boolean;
};

/**
 * Count the signed-in user's `bookings` rows.
 *
 * Filters by `user_id` in the app. Does not broaden grants. On any failure,
 * returns `{ count: 0, unavailable: true }` so the empty-state shell stays safe.
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
