import { ActionResult, resultFailure } from "@/entities/action-result";

export function unhandledErrortoActionResultError(
  err: unknown,
): ActionResult<never> {
  const code = "unexpected_error";

  console.error("[UNEXPECTED ERROR] :", err);

  return resultFailure(code);
}
