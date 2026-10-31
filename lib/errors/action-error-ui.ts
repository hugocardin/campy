import { CommonErrorCode } from "./common";

/** next-intl translator shape we need (`t` + `t.has`). */
export type ErrorTranslator = {
  (
    key: string,
    values?: Record<string, string | number | Date>,
  ): string;
  has: (key: string) => boolean;
};

/** Only these `details` keys may be interpolated into user-visible ICU messages. */
const INTERPOLATABLE_DETAIL_KEYS = new Set(["field"]);

/**
 * Allowlisted `field` values → errors-namespace label keys (`fields.*`).
 * Only values with a translated label may appear in COMMON_MISSING_NAMED_FIELD.
 * Internal/unlabeled names like `id` stay on the generic COMMON_MISSING_FIELD.
 */
export const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  code: "fields.code",
  category: "fields.category",
};

/** Named missing-field message used when `field` has a translated label. */
export const COMMON_MISSING_NAMED_FIELD = "COMMON_MISSING_NAMED_FIELD";

/** Pull the support correlation id from an ActionResult `details` payload. */
export function getActionErrorId(
  details?: Record<string, unknown>,
): string | undefined {
  const id = details?.errorId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Allowlisted ICU values from ActionResult `details`.
 * Unexpected keys (and unlabeled field names like `id`) are dropped — never forwarded.
 * Returned `field` values are still raw allowlisted keys; `translateErrorCode`
 * maps them through translated form labels before interpolation.
 */
export function safeTranslationValues(
  details?: Record<string, unknown>,
): Record<string, string | number> {
  if (!details) {
    return {};
  }

  const values: Record<string, string | number> = {};
  for (const key of INTERPOLATABLE_DETAIL_KEYS) {
    const value = details[key];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    if (key === "field" && !Object.hasOwn(FIELD_LABEL_KEYS, value)) {
      continue;
    }
    values[key] = value;
  }
  return values;
}

/**
 * Resolve an allowlisted field key to its translated form label.
 * Returns undefined when unlabeled/internal or the catalogue key is missing.
 */
export function resolveFieldLabel(
  field: string,
  tErrors: ErrorTranslator,
): string | undefined {
  const labelKey = FIELD_LABEL_KEYS[field];
  if (!labelKey || !tErrors.has(labelKey)) {
    return undefined;
  }
  const label = tErrors(labelKey);
  if (!label || looksLikeMissingMessage(label, labelKey)) {
    return undefined;
  }
  return label;
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

  let code = errorCode;
  let values = safeTranslationValues(details);

  // Prefer a named message with a translated form label; otherwise keep the
  // generic COMMON_MISSING_FIELD (no placeholder) for unlabeled/internal fields.
  if (errorCode === CommonErrorCode.COMMON_MISSING_FIELD) {
    const rawField = values.field;
    if (typeof rawField === "string") {
      const label = resolveFieldLabel(rawField, tErrors);
      if (label && tErrors.has(COMMON_MISSING_NAMED_FIELD)) {
        code = COMMON_MISSING_NAMED_FIELD;
        values = { field: label };
      } else {
        values = {};
      }
    } else {
      values = {};
    }
  }

  try {
    const message =
      Object.keys(values).length > 0
        ? tErrors(code, values)
        : tErrors(code);

    if (!message || looksLikeMissingMessage(message, code)) {
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
