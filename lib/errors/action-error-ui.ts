/** Pull the support correlation id from an ActionResult `details` payload. */
export function getActionErrorId(
  details?: Record<string, unknown>,
): string | undefined {
  const id = details?.errorId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
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
