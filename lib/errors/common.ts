export const CommonErrorCode = {
  COMMON_MISSING_FIELD: "COMMON_MISSING_FIELD",
  COMMON_FIELD_TOO_LONG: "COMMON_FIELD_TOO_LONG",
  COMMON_INVALID_FIELD: "COMMON_INVALID_FIELD",
} as const;

export type CommonErrorCodeType =
  (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
