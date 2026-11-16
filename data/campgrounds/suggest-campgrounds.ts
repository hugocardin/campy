import "server-only";

import { sanitizeCampgroundSearchTerm } from "@/lib/campground-search";
import {
  SUGGEST_CAMPGROUND_LIMIT,
  SUGGEST_MIN_CHARS,
  type CampgroundSuggestion,
} from "@/lib/geocoding/types";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type SuggestRow = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
};

/**
 * Active campground name/city suggestions (unaccent/trigram via RPC).
 * Primitives for React `cache` identity.
 */
export const suggestCampgrounds = cache(
  async (
    q: string,
    limit: number = SUGGEST_CAMPGROUND_LIMIT,
  ): Promise<ActionResult<CampgroundSuggestion[]>> => {
    try {
      const term = sanitizeCampgroundSearchTerm(q);
      if (term.length < SUGGEST_MIN_CHARS) {
        return resultSuccess([]);
      }

      const supabase = await createClient();
      const capped = Math.min(Math.max(limit, 1), 20);

      const result = await handleDbResponse(
        supabase.rpc("suggest_campgrounds", {
          q: term,
          result_limit: capped,
        }),
      );

      if (!result.success) {
        return result;
      }

      const rows = (result.data as SuggestRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        province: row.province,
      }));

      return resultSuccess(rows);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
