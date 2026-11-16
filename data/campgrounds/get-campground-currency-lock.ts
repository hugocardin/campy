import {
  resolveCampgroundCurrencyLockReason,
  type CampgroundCurrencyLockReason,
} from "@/lib/campground-currency-lock";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

/**
 * Whether listing currency is locked for this park (sites and/or amount
 * bookings). Platform-admin edit UI + updateCampgroundAction.
 */
export async function getCampgroundCurrencyLockReasonForClient(
  supabase: SupabaseClient,
  campgroundId: string,
): Promise<CampgroundCurrencyLockReason | null> {
  const { data: siteRows, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("campground_id", campgroundId);

  if (siteError) {
    throw siteError;
  }

  const siteIds = (siteRows ?? []).map((row) => row.id as string);
  const hasSites = siteIds.length > 0;

  // Bookings store total_price (NOT NULL). Empty today; guard is intentional.
  let hasAmountBookings = false;
  if (siteIds.length > 0) {
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .in("site_id", siteIds)
      .limit(1)
      .maybeSingle();

    if (bookingError) {
      throw bookingError;
    }
    hasAmountBookings = bookingRow != null;
  }

  return resolveCampgroundCurrencyLockReason({
    hasSites,
    hasAmountBookings,
  });
}

export const getCampgroundCurrencyLockReason = cache(
  async (
    campgroundId: string,
  ): Promise<ActionResult<CampgroundCurrencyLockReason | null>> => {
    try {
      const supabase = await createClient();
      const reason = await getCampgroundCurrencyLockReasonForClient(
        supabase,
        campgroundId,
      );
      return resultSuccess(reason);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
