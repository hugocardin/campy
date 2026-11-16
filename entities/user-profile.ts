export interface UserProfile {
  id: string;
  role_name: string;
  full_name: string;
  email: string;
  /** Canonical feet (`profiles.default_rig_length`); null when unset. */
  default_rig_length: number | null;
}

export interface UserProfileNoRole {
  id: string;
  full_name: string;
  email: string;
}
