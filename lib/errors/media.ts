export const MediaErrorCode = {
  MEDIA_FILE_TOO_LARGE: "MEDIA_FILE_TOO_LARGE",
  MEDIA_UNSUPPORTED_TYPE: "MEDIA_UNSUPPORTED_TYPE",
  MEDIA_LIMIT_REACHED: "MEDIA_LIMIT_REACHED",
  MEDIA_STORAGE_FAILED: "MEDIA_STORAGE_FAILED",
  MEDIA_COVER_CONFLICT: "MEDIA_COVER_CONFLICT",
  /** Ambiguous: write may have committed; client must not delete the object. */
  MEDIA_COMMIT_UNCERTAIN: "MEDIA_COMMIT_UNCERTAIN",
  /** Orphan sweep aborted (incomplete listing, URL parse failure, etc.). */
  MEDIA_SWEEP_ABORTED: "MEDIA_SWEEP_ABORTED",
} as const;

export type MediaErrorCodeType =
  (typeof MediaErrorCode)[keyof typeof MediaErrorCode];
