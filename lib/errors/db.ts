export const DbErrorCode = {
  // Most common & actionable
  DUPLICATE_VALUE: "DB_DUPLICATE_VALUE",
  INVALID_REFERENCE: "DB_INVALID_REFERENCE", // foreign key
  NOT_NULL_VIOLATION: "DB_NOT_NULL_VIOLATION",
  CHECK_VIOLATION: "DB_CHECK_VIOLATION",
  NOT_FOUND: "NOT_FOUND",

  // Auth / permission related
  PERMISSION_DENIED: "DB_PERMISSION_DENIED",
  SESSION_EXPIRED: "DB_SESSION_EXPIRED", // JWT expired etc.

  // Fallbacks
  UNHANDLED_DATABASE_ERROR: "DB_UNHANDLED_ERROR",
  CONNECTION_ERROR: "DB_CONNECTION_ERROR",
} as const;

export type DbErrorCodeType = (typeof DbErrorCode)[keyof typeof DbErrorCode];
