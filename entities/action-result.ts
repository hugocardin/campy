export type ActionResult<T = unknown> =
  | {
      success: true;
      data?: T;
    }
  | {
      success: false;
      error: ActionError;
    };

export type ActionError = {
  code: string;
  message: string;
};
