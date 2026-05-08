import { AuthError } from "@supabase/supabase-js";
import { AuthErrorCode, AuthErrorCodeType } from "../errors";

export function mapAuthError(error: AuthError): AuthErrorCodeType {
  const code = error.code;
  const message = error.message?.toLowerCase() || "";

  // ── Common Supabase Auth error patterns ────────────────────────
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return AuthErrorCode.AUTH_INVALID_CREDENTIALS;
  }

  if (
    code === "user_already_registered" ||
    message.includes("already registered")
  ) {
    return AuthErrorCode.AUTH_EMAIL_ALREADY_EXISTS;
  }

  if (message.includes("password") && message.includes("weak")) {
    return AuthErrorCode.AUTH_WEAK_PASSWORD;
  }

  if (message.includes("confirmed") || message.includes("verify")) {
    return AuthErrorCode.AUTH_EMAIL_NOT_CONFIRMED;
  }

  if (code === "too_many_requests" || message.includes("rate limit")) {
    return AuthErrorCode.AUTH_TOO_MANY_REQUESTS;
  }

  if (message.includes("email")) {
    return AuthErrorCode.AUTH_INVALID_EMAIL;
  }

  // Network / timeout / offline
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch")
  ) {
    return AuthErrorCode.AUTH_NETWORK_ERROR;
  }

  // Catch-all
  console.warn("Unhandled auth error:", { code, message: error.message });

  return AuthErrorCode.AUTH_UNKNOWN_AUTH_ERROR;
}
