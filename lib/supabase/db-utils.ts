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
  resultError,
  resultSuccess,
} from "../errors";
import { mapAuthError } from "./auth-utils";

type SupabaseAuthResult = AuthTokenResponsePassword | AuthResponse;

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
    return resultError(DbErrorCode.NOT_FOUND);
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

  // Otherwise it's an unexpected JS error (network, createClient failure, etc.)
  console.error("Unexpected database-related error:", err);

  return resultError(DbErrorCode.UNHANDLED_DATABASE_ERROR, {
    message: err instanceof Error ? err.message : "Unknown error",
    ...{
      stack: err instanceof Error ? err.stack : undefined,
    },
  });
}

// ── Returns domain error code + rich details for client ───────────────────────
function mapPostgrestError(error: PostgrestError): ActionResult<never> {
  switch (error.code) {
    case "23505": // unique_violation
      return resultError(DbErrorCode.DUPLICATE_VALUE, { ...error });

    case "23503": // foreign_key_violation
      return resultError(DbErrorCode.INVALID_REFERENCE, { ...error });

    case "23502": // not_null_violation
      return resultError(DbErrorCode.NOT_NULL_VIOLATION, { ...error });

    case "23514": // check_violation
      return resultError(DbErrorCode.CHECK_VIOLATION, { ...error });

    case "42501": // insufficient_privilege
      return resultError(DbErrorCode.PERMISSION_DENIED, { ...error });

    case "PGRST301": // JWT expired / invalid (PostgREST specific)
    case "PGRST302": // other JWT issues
      return resultError(DbErrorCode.SESSION_EXPIRED, { ...error });

    default:
      console.warn("Unhandled Postgrest error code:", error);
      return resultError(DbErrorCode.UNHANDLED_DATABASE_ERROR, { ...error });
  }
}

function isPostgrestError(err: unknown): err is PostgrestError {
  if (typeof err !== "object" || err === null) {
    return false;
  }

  if (err instanceof PostgrestError) {
    return true;
  }

  const e = err as Record<string, unknown>;
  return typeof e.code === "string" && typeof e.message === "string";
}
