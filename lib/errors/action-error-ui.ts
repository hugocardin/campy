/** next-intl translator shape we need (`t` + `t.has`). */
export type ErrorTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/** Pull the support correlation id from an ActionResult `details` payload. */
export function getActionErrorId(
  details?: Record<string, unknown>,
): string | undefined {
  const id = details?.errorId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Translate an ActionResult `errorCode` via the errors namespace.
 * Falls back when the code is missing or untranslated (e.g. fr-CA without errors.json keys).
 */
export function translateErrorCode(
  errorCode: string | undefined,
  tErrors: ErrorTranslator,
  fallback: string,
): string {
  if (!errorCode || !tErrors.has(errorCode)) {
    return fallback;
  }
  return tErrors(errorCode);
}

/**
 * Append a translated "Reference: {errorId}" line when present so users can quote it to support.
 * `formatReference` should already be localized (e.g. `tc("errorReference", { errorId })`).
 */
export function withErrorReference(
  message: string,
  details: Record<string, unknown> | undefined,
  formatReference: (errorId: string) => string,
): string {
  const errorId = getActionErrorId(details);
  if (!errorId) {
    return message;
  }
  return `${message}\n${formatReference(errorId)}`;
}
