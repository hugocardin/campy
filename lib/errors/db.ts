export const DbErrorCode = {
  // Most common & actionable
  DB_DUPLICATE_VALUE: "DB_DUPLICATE_VALUE",
  DB_INVALID_REFERENCE: "DB_INVALID_REFERENCE", // foreign key
  DB_NOT_NULL_VIOLATION: "DB_NOT_NULL_VIOLATION",
  DB_CHECK_VIOLATION: "DB_CHECK_VIOLATION",
  DB_NOT_FOUND: "DB_NOT_FOUND",

  // Auth / permission related
  DB_PERMISSION_DENIED: "DB_PERMISSION_DENIED",
  DB_SESSION_EXPIRED: "DB_SESSION_EXPIRED", // JWT expired etc.

  // Fallbacks
  DB_UNHANDLED_DATABASE_ERROR: "DB_UNHANDLED_ERROR",
  DB_CONNECTION_ERROR: "DB_CONNECTION_ERROR",
} as const;

export type DbErrorCodeType = (typeof DbErrorCode)[keyof typeof DbErrorCode];
