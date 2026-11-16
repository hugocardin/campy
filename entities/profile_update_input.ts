import type { RigLengthUnit } from "@/lib/site-rig-length";

/**
 * Guest-editable profile fields (own-row UPDATE allow-list).
 * `default_rig_length` is canonical feet; null clears the preference.
 * `preferred_rig_unit` is ft|m; required on save so the last toggle is remembered.
 */
export type ProfileUpdateInput = {
  full_name: string;
  default_rig_length: number | null;
  preferred_rig_unit: RigLengthUnit;
};
