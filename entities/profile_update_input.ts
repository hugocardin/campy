import type { RigLengthUnit } from "@/lib/site-rig-length";

/**
 * Guest-editable profile fields (own-row UPDATE allow-list).
 * `default_rig_length` is canonical feet; null clears the preference.
 * `preferred_rig_unit` is optional: omit / undefined → leave column unchanged
 * (older clients / untouched locale default); `ft`|`m` → persist.
 */
export type ProfileUpdateInput = {
  full_name: string;
  default_rig_length: number | null;
  preferred_rig_unit?: RigLengthUnit;
};
