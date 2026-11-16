import "server-only";

import {
  parseStoredRigLengthUnit,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

/**
 * Signed-in guest's `profiles.preferred_rig_unit`, or null when unsigned /
 * unset / unreadable. Used by guest search to default the unit toggle
 * (issue #42 step 2). Does not read or apply `default_rig_length` (step 3).
 *
 * Cached per React request so home + other callers share one Auth round trip.
 */
export const getCurrentPreferredRigUnit = cache(
  async (): Promise<RigLengthUnit | null> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_rig_unit")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        // Log; fall back to locale/feet default for the UI.
        handleUnexpectedError(error);
        return null;
      }
      if (!data) return null;
      // TODO: regenerate DB types so preferred_rig_unit is typed without a cast.
      return parseStoredRigLengthUnit(
        (data as { preferred_rig_unit?: string | null }).preferred_rig_unit,
      );
    } catch (err) {
      handleUnexpectedError(err);
      return null;
    }
  },
);
