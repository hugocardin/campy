export const CommonErrorCode = {
  COMMON_MISSING_FIELD: "COMMON_MISSING_FIELD",
} as const;

export type CommonErrorCodeType =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
