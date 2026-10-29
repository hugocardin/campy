import {
  AuthResponse,
  AuthTokenResponsePassword,
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";
import {
  ActionResult,
  DbErrorCode,
  DbErrorCodeType,
  resultError,
  resultSuccess,
} from "../errors";
import { mapAuthError } from "./auth-utils";

type SupabaseAuthResult = AuthTokenResponsePassword | AuthResponse;

/** Client-safe details: correlation id only — never Postgres/Node internals. */
type SafeErrorDetails = { errorId: string };

export async function handleAuthResponse(
  authFn: () => Promise<SupabaseAuthResult>,
): Promise<ActionResult<void>> {
  const result = await authFn();

  if (result.error) {
    const authErrorCode = mapAuthError(result.error);
    return resultError(authErrorCode);
  }

  return resultSuccess();
}

export async function handleDbResponse<T>(
  query: PromiseLike<PostgrestResponse<T>>,
): Promise<ActionResult<T[]>> {
  const { data, error } = await query;

  if (error) {
    return mapPostgrestError(error);
  }

  return resultSuccess(data);
}

export async function handleDbSingle<T>(
  query: PromiseLike<PostgrestSingleResponse<T>>,
): Promise<ActionResult<T>> {
  const { data, error } = await query;

  if (error) {
    return mapPostgrestError(error);
  }

  if (data === null) {
    return resultError(DbErrorCode.DB_NOT_FOUND);
  }

  return resultSuccess(data);
}

export async function handleDbMaybeSingle<T>(
  promise: Promise<PostgrestSingleResponse<T | null>>,
): Promise<ActionResult<T | null>> {
  const { data, error } = await promise;

  if (error) {
    return mapPostgrestError(error);
  }

  return resultSuccess(data);
}

export async function handleDbNoData(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ActionResult<void>> {
  const { error } = await query;

  if (error) {
    return handleUnexpectedError(error);
  }

  return resultSuccess();
}

export function handleUnexpectedError(err: unknown): ActionResult<never> {
  if (isPostgrestError(err)) {
    return mapPostgrestError(err);
  }

  const errorId = crypto.randomUUID();
  logServerError(errorId, "Unexpected database-related error", err);

  return safeClientError(DbErrorCode.DB_UNHANDLED_DATABASE_ERROR, errorId);
}

/** Maps PostgREST errors to domain codes; never returns Postgres internals to the client. */
export function mapPostgrestError(error: PostgrestError): ActionResult<never> {
  const errorId = crypto.randomUUID();
  const errorCode = postgrestErrorCode(error);

  logServerError(errorId, "PostgREST error", error, { mappedCode: errorCode });

  return safeClientError(errorCode, errorId);
}

function postgrestErrorCode(error: PostgrestError): DbErrorCodeType {
  switch (error.code) {
    case "23505": // unique_violation
      return DbErrorCode.DB_DUPLICATE_VALUE;

    case "23503": // foreign_key_violation
      return DbErrorCode.DB_INVALID_REFERENCE;

    case "23502": // not_null_violation
      return DbErrorCode.DB_NOT_NULL_VIOLATION;

    case "23514": // check_violation
      return DbErrorCode.DB_CHECK_VIOLATION;

    case "42501": // insufficient_privilege
      return DbErrorCode.DB_PERMISSION_DENIED;

    case "PGRST301": // JWT expired / invalid (PostgREST specific)
    case "PGRST302": // other JWT issues
      return DbErrorCode.DB_SESSION_EXPIRED;

    default:
      return DbErrorCode.DB_UNHANDLED_DATABASE_ERROR;
  }
}

function safeClientError(
  errorCode: DbErrorCodeType,
  errorId: string,
): ActionResult<never> {
  const details: SafeErrorDetails = { errorId };
  return resultError(errorCode, details);
}

/**
 * True for real PostgREST errors (class instance or plain `{ code, message, details, hint }`).
 * Requires `details` + `hint` so Node/undici `{ code, message }` errors are not misrouted.
 */
export function isPostgrestError(err: unknown): err is PostgrestError {
  if (typeof err !== "object" || err === null) {
    return false;
  }

  if (err instanceof PostgrestError) {
    return true;
  }

  const e = err as Record<string, unknown>;
  return (
    typeof e.code === "string" &&
    typeof e.message === "string" &&
    typeof e.details === "string" &&
    typeof e.hint === "string"
  );
}

/**
 * Log a redacted, support-correlatable snapshot. Avoid dumping raw objects that may
 * carry fetch URL/header/`cause` chains (e.g. admin service-role paths).
 */
function logServerError(
  errorId: string,
  label: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  const prefix = `[${errorId}] ${label}`;

  if (isPostgrestError(err)) {
    console.error(prefix, {
      ...extra,
      code: err.code,
      message: err.message,
      details: err.details,
      hint: err.hint,
    });
    return;
  }

  if (err instanceof Error) {
    console.error(prefix, {
      ...extra,
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(typeof (err as NodeJS.ErrnoException).code === "string"
        ? { code: (err as NodeJS.ErrnoException).code }
        : {}),
    });
    return;
  }

  // Plain non-PostgREST objects (e.g. { code: 'ECONNREFUSED', message }) — allowlist only.
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    console.error(prefix, {
      ...extra,
      ...(typeof e.name === "string" ? { name: e.name } : {}),
      ...(typeof e.code === "string" ? { code: e.code } : {}),
      ...(typeof e.message === "string" ? { message: e.message } : {}),
    });
    return;
  }

  console.error(prefix, {
    ...extra,
    valueType: typeof err,
  });
}
