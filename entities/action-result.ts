export type ActionResult<T = unknown> =
  | {
      success: true;
      data?: T;
    }
  | {
      success: false;
      error_code: string;
    };

// ── Factory functions ────────────────────────────────────────────────
export function resultSuccess<T>(data?: T): ActionResult<T> {
  return { success: true, data };
}

export function resultFailure(error_code: string): ActionResult<never> {
  return {
    success: false,
    error_code: error_code,
  };
}
