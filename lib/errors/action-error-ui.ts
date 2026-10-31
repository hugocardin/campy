import { CommonErrorCode } from "./common";

/** next-intl translator shape we need (`t` + `t.has`). */
export type ErrorTranslator = {
  (
    key: string,
    values?: Record<string, string | number | Date>,
  ): string;
  has: (key: string) => boolean;
};

/**
 * Detail keys that may be interpolated into user-visible ICU messages.
 * Empty on purpose: flat error codes do not interpolate `details`. Named
 * missing-field copy comes from caller-supplied `fieldMessages`, never from
 * forwarding raw namespaced ids like `amenity.code` into `{field}`.
 */
const INTERPOLATABLE_DETAIL_KEYS = new Set<string>();

/**
 * Entity-namespaced `field` values emitted by amenity actions.
 * Callers map these to form-local required messages (not raw column names).
 */
export const AmenityMissingField = {
  code: "amenity.code",
  category: "amenity.category",
} as const;

/** Optional per-call hooks for translating ActionResult errors. */
export type TranslateErrorOptions = {
  /**
   * Entity-namespaced field → fully translated missing-field message.
   * Prefer form-local copy (e.g. `amenities.errors.codeRequired`) so fr-CA can
   * use correct agreement without interpolating a free-form noun into a sentence.
   * Only keys present here get a named message; unlabeled fields stay generic.
   */
  fieldMessages?: Readonly<Record<string, string>>;
};

/** Pull the support correlation id from an ActionResult `details` payload. */
export function getActionErrorId(
  details?: Record<string, unknown>,
): string | undefined {
  const id = details?.errorId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function hasOwnKey(
  object: object,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Allowlisted ICU values from ActionResult `details`.
 * Currently forwards nothing — unexpected keys (and raw `field` ids) are
 * dropped so they can never reach a `{field}` catalogue placeholder.
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
    values[key] = value;
  }
  return values;
}

/**
 * Resolve an entity-namespaced field to a caller-supplied missing-field message.
 * Guards prototype keys (`constructor`, `__proto__`, …) via hasOwnProperty.
 * Returns undefined when unlabeled/internal or the mapped message is empty.
 */
export function resolveFieldMessage(
  field: string,
  fieldMessages?: Readonly<Record<string, string>>,
): string | undefined {
  if (!fieldMessages || !hasOwnKey(fieldMessages, field)) {
    return undefined;
  }
  const message = fieldMessages[field];
  if (typeof message !== "string" || message.trim().length === 0) {
    return undefined;
  }
  return message;
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
 *
 * For `COMMON_MISSING_FIELD`, prefers a caller-supplied per-field message
 * (form-local, entity-namespaced) when present; otherwise the generic catalogue
 * entry. Details are never interpolated into ICU.
 */
export function translateErrorCode(
  errorCode: string | undefined,
  tErrors: ErrorTranslator,
  fallback: string,
  details?: Record<string, unknown>,
  options?: TranslateErrorOptions,
): string {
  if (!errorCode || !tErrors.has(errorCode)) {
    return fallback;
  }

  try {
    if (errorCode === CommonErrorCode.COMMON_MISSING_FIELD) {
      const rawField = details?.field;
      if (typeof rawField === "string" && rawField.length > 0) {
        const named = resolveFieldMessage(rawField, options?.fieldMessages);
        if (named) {
          return named;
        }
      }
    }

    // Never pass details into ICU — safeTranslationValues is always empty today
    // and exists to keep the allowlist explicit for future keys.
    const values = safeTranslationValues(details);
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
