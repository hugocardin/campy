export interface UserProfile {
  id: string;
  role_name: string;
  full_name: string;
  email: string;
}

export interface UserProfileNoRole {
  id: string;
  full_name: string;
  email: string;
}
