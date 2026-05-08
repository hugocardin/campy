export const AUTH_MODES = {
  SIGNIN: "signin" as const,
  SIGNUP: "signup" as const,
} as const;

export type AuthMode = (typeof AUTH_MODES)[keyof typeof AUTH_MODES];
