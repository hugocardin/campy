export const CommonErrorCode = {
  MISSING_ID: "MISSING_ID",
} as const;

export type CommonErrorCodeType =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
