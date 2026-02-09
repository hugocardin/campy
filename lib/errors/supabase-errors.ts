import { ActionResult } from "@/entities/action-result";
import { PostgrestError } from "@supabase/supabase-js";

export function pgerrorToActionResultError(
  pgError: PostgrestError,
  fallback: string | null = null,
): ActionResult<never> {
  if (!fallback) {
    fallback = `Unhandled db error: ${pgError}`;
  }

  switch (pgError.code) {
    case "23505": // unique violation
      return {
        success: false,
        error: {
          code: "duplicate_value",
          message: "This value already exists.",
        },
      };

    case "23503": // foreign key violation
      return {
        success: false,
        error: {
          code: "invalid_reference",
          message: "Invalid reference — item does not exist.",
        },
      };

    case "42501": // permission denied
      return {
        success: false,
        error: {
          code: "permission_denied",
          message: "You do not have permission for this action.",
        },
      };

    case "PGRST301": // JWT expired
      return {
        success: false,
        error: {
          code: "session_expired",
          message: "Session expired. Please sign in again.",
        },
      };

    default:
      console.error("Unhandled Supabase error:", {
        code: pgError.code,
        message: pgError.message,
        details: pgError.details,
        hint: pgError.hint,
      });

      return {
        success: false,
        error: { code: "database_error", message: fallback },
      };
  }
}
