import "server-only";

import {
  normalizeStoredRigLengthFeet,
  parseStoredRigLengthUnit,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type CurrentRigSearchPrefs = {
  preferredRigUnit: RigLengthUnit | null;
  /** Canonical feet from `profiles.default_rig_length`, or null when unset. */
  defaultRigLength: number | null;
};

/**
 * Signed-in guest's rig search preferences (`preferred_rig_unit` +
 * `default_rig_length`), or nulls when unsigned / unset / unreadable.
 *
 * Used by guest search when the URL omits `rigUnit` / `rigLength`
 * (issue #42 steps 2–3). Cached per React request so home shares one Auth
 * round trip.
 */
export const getCurrentRigSearchPrefs = cache(
  async (): Promise<CurrentRigSearchPrefs> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { preferredRigUnit: null, defaultRigLength: null };
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_rig_unit, default_rig_length")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        // Log; fall back to locale/feet default for the UI.
        handleUnexpectedError(error);
        return { preferredRigUnit: null, defaultRigLength: null };
      }
      if (!data) {
        return { preferredRigUnit: null, defaultRigLength: null };
      }

      // TODO: regenerate DB types so preferred_rig_unit is typed without a cast.
      const row = data as {
        preferred_rig_unit?: string | null;
        default_rig_length?: number | string | null;
      };
      const preferredRigUnit = parseStoredRigLengthUnit(
        row.preferred_rig_unit,
      );
      const rig = normalizeStoredRigLengthFeet(
        row.default_rig_length == null || row.default_rig_length === ""
          ? null
          : Number(row.default_rig_length),
      );
      return {
        preferredRigUnit,
        defaultRigLength: rig.ok ? rig.feet : null,
      };
    } catch (err) {
      handleUnexpectedError(err);
      return { preferredRigUnit: null, defaultRigLength: null };
    }
  },
);
