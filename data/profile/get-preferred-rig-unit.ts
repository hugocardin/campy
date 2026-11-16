import "server-only";

import {
  parseStoredRigLengthUnit,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { createClient } from "@/lib/supabase/server";

/**
 * Signed-in guest's `profiles.preferred_rig_unit`, or null when unsigned /
 * unset / unreadable. Used by guest search to default the unit toggle
 * (issue #42 step 2). Does not read or apply `default_rig_length` (step 3).
 */
export async function getCurrentPreferredRigUnit(): Promise<RigLengthUnit | null> {
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

    if (error || !data) return null;
    return parseStoredRigLengthUnit(
      (data as { preferred_rig_unit?: string | null }).preferred_rig_unit,
    );
  } catch {
    return null;
  }
}
