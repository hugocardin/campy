/**
 * Guest-editable profile fields (own-row UPDATE allow-list).
 * `default_rig_length` is canonical feet; null clears the preference.
 */
export type ProfileUpdateInput = {
  full_name: string;
  default_rig_length: number | null;
};
