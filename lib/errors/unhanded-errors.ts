import { ActionResult } from "@/entities/action-result";

export function unhandledErrortoActionResultError(
  err: unknown,
): ActionResult<never> {
  const code = "unexpected_error";
  let message = "An unexpected error occurred. Please try again later.";

  if (err instanceof Error) {
    message = err.message || message;
  }

  console.error("[UNEXPECTED ERROR] :", err);

  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}
