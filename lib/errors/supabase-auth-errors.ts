import { ActionError } from "@/entities/action-result";
import type { AuthError } from "@supabase/supabase-js";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_already_exists"
  | "weak_password"
  | "email_not_confirmed"
  | "too_many_requests"
  | "invalid_email"
  | "network_error"
  | "unknown_auth_error";

export function mapAuthError(error: AuthError | null): ActionError {
  if (!error) {
    return {
      code: "unknown_auth_error",
      message: "An unknown error occurred.",
    };
  }

  const code = error.code;
  const message = error.message?.toLowerCase() || "";

  // ── Common Supabase Auth error patterns ────────────────────────
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return {
      code: "invalid_credentials",
      message: "Invalid email or password.",
    };
  }

  if (
    code === "user_already_registered" ||
    message.includes("already registered")
  ) {
    return {
      code: "email_already_exists",
      message: "This email is already registered.",
    };
  }

  if (message.includes("password") && message.includes("weak")) {
    return { code: "weak_password", message: "Password is too weak." };
  }

  if (message.includes("confirmed") || message.includes("verify")) {
    return {
      code: "email_not_confirmed",
      message: "Please confirm your email first.",
    };
  }

  if (code === "too_many_requests" || message.includes("rate limit")) {
    return {
      code: "too_many_requests",
      message: "Too many attempts. Please try again later.",
    };
  }

  if (message.includes("email")) {
    return { code: "invalid_email", message: "Invalid email address." };
  }

  // Network / timeout / offline
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch")
  ) {
    return {
      code: "network_error",
      message: "Network error. Please check your connection.",
    };
  }

  // Catch-all
  console.warn("Unhandled auth error:", { code, message: error.message });

  return {
    code: "unknown_auth_error",
    message: "An unexpected authentication error occurred.",
  };
}
