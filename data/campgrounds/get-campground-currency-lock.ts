import {
  isCampgroundCurrencyLockReason,
  type CampgroundCurrencyLockReason,
} from "@/lib/campground-currency-lock";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

/**
 * Lock reason from shared SQL `campground_currency_lock_reason` (same rule as
 * the currency UPDATE trigger). Used by admin edit UI only.
 */
export async function getCampgroundCurrencyLockReasonForClient(
  supabase: SupabaseClient,
  campgroundId: string,
): Promise<CampgroundCurrencyLockReason | null> {
  const { data, error } = await supabase.rpc(
    "campground_currency_lock_reason",
    { p_campground_id: campgroundId },
  );

  if (error) {
    throw error;
  }

  if (data == null || data === "") {
    return null;
  }

  if (!isCampgroundCurrencyLockReason(data)) {
    throw new Error(`unexpected currency lock reason: ${String(data)}`);
  }

  return data;
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
