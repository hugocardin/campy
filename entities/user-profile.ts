import type { RigLengthUnit } from "@/lib/site-rig-length";

export interface UserProfile {
  id: string;
  role_name: string;
  full_name: string;
  email: string;
  /**
   * Canonical feet (`profiles.default_rig_length`); null when unset.
   * Guest search pre-fills `rigLength` from this when the URL omits it.
   */
  default_rig_length: number | null;
  /**
   * Preferred display unit (`profiles.preferred_rig_unit`); null → locale
   * fallback in the profile form / search default.
   */
  preferred_rig_unit: RigLengthUnit | null;
}

export interface UserProfileNoRole {
  id: string;
  full_name: string;
  email: string;
}
