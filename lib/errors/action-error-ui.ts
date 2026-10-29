/** next-intl translator shape we need (`t` + `t.has`). */
export type ErrorTranslator = {
  (
    key: string,
    values?: Record<string, string | number | Date>,
  ): string;
  has: (key: string) => boolean;
};

/** Pull the support correlation id from an ActionResult `details` payload. */
export function getActionErrorId(
  details?: Record<string, unknown>,
): string | undefined {
  const id = details?.errorId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** String/number details safe to pass as ICU values (skips errorId and objects). */
export function safeTranslationValues(
  details?: Record<string, unknown>,
): Record<string, string | number> {
  if (!details) {
    return {};
  }

  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === "errorId") {
      continue;
    }
    if (typeof value === "string" && value.length > 0) {
      values[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = value;
    }
  }
  return values;
}

function looksLikeMissingMessage(message: string, errorCode: string): boolean {
  return (
    message === errorCode ||
    message === `errors.${errorCode}` ||
    message.endsWith(`.${errorCode}`)
  );
}

/**
 * Translate an ActionResult `errorCode` via the errors namespace.
 * Falls back when the code is missing, untranslated, or ICU formatting fails
 * (e.g. malformed catalogue entry → next-intl returns `errors.CODE`).
 */
export function translateErrorCode(
  errorCode: string | undefined,
  tErrors: ErrorTranslator,
  fallback: string,
  details?: Record<string, unknown>,
): string {
  if (!errorCode || !tErrors.has(errorCode)) {
    return fallback;
  }

  const values = safeTranslationValues(details);

  try {
    const message =
      Object.keys(values).length > 0
        ? tErrors(errorCode, values)
        : tErrors(errorCode);

    if (!message || looksLikeMissingMessage(message, errorCode)) {
      return fallback;
    }

    return message;
  } catch {
    return fallback;
  }
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
