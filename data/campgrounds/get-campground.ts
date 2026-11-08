import { toCampgroundDomain } from "@/data/campgrounds/get-campgrounds";
import { Campground } from "@/entities/campground";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

/** Public guest read: active parks only via `v_campgrounds`. */
export const getCampgroundById = cache(
  async (id: string): Promise<ActionResult<Campground>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbSingle(
        supabase.from("v_campgrounds").select("*").eq("id", id).single(),
      );

      if (!result.success) {
        return result;
      }

      return resultSuccess(toCampgroundDomain(result.data));
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
