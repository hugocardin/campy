import { AuthErrorCodeType } from "./auth";
import { CommonErrorCodeType } from "./common";
import { DbErrorCodeType } from "./db";
import { MediaErrorCodeType } from "./media";

export * from "./action-error-ui";
export * from "./auth";
export * from "./common";
export * from "./db";
export * from "./media";

export type ErrorCode =
  | AuthErrorCodeType
  | DbErrorCodeType
  | CommonErrorCodeType
  | MediaErrorCodeType;

export type ActionResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      errorCode?: ErrorCode;
      details?: Record<string, unknown>;
    };

// ── Factory functions ────────────────────────────────────────────────
export function resultSuccess<T = void>(data?: T): ActionResult<T> {
  return { success: true, data: data as T };
}

export function resultError(
  errorCode?: ErrorCode,
  details?: Record<string, unknown>,
): ActionResult<never> {
  return {
    success: false,
    errorCode,
    details,
  };
}
