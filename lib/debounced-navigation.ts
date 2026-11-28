/**
 * Debounced navigation helper: coalesce rapid state updates into one navigate
 * call after a quiet period. Holds the intended target separately so callers
 * can keep applying local UI without a later sync effect clobbering what will
 * be pushed.
 */
export type DebouncedNavigateReason = "debounce" | "flushPending" | "flushNow";

export type DebouncedNavigateMeta = {
  reason: DebouncedNavigateReason;
};

export type DebouncedNavigation<T> = {
  /** Queue `state` and (re)start the quiet-period timer. */
  schedule(state: T): void;
  /** Cancel any pending timer and navigate with `state` immediately. */
  flushNow(state: T): void;
  /**
   * If a navigation is pending, flush it now (same as `flushNow` with the
   * held target). Returns true when a flush ran.
   */
  flushPending(): boolean;
  /** Drop a pending navigation without calling `navigate`. */
  cancel(): void;
  /** Replace the navigate callback (e.g. from a layout effect). */
  setNavigate(navigate: (state: T, meta: DebouncedNavigateMeta) => void): void;
  /** Pending target, if a timer is armed. */
  peekPending(): T | null;
  /** True while a debounced navigation is scheduled. */
  isPending(): boolean;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export function createDebouncedNavigation<T>(options: {
  debounceMs: number;
  /** Optional initial navigate; prefer `setNavigate` from an effect when wiring React. */
  navigate?: (state: T, meta: DebouncedNavigateMeta) => void;
  /** Fired when a debounce becomes pending or clears (schedule / flush / cancel / fire). */
  onPendingChange?: (pending: boolean) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): DebouncedNavigation<T> {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let timer: TimerHandle | null = null;
  let pending: T | null = null;
  let navigate =
    options.navigate ??
    ((..._args: [T, DebouncedNavigateMeta]) => {
      void _args;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "createDebouncedNavigation: navigate called before setNavigate",
        );
      }
    });

  function setPendingFlag(next: boolean) {
    options.onPendingChange?.(next);
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  return {
    schedule(state) {
      pending = state;
      clearTimer();
      setPendingFlag(true);
      timer = setTimeoutFn(() => {
        timer = null;
        const target = pending;
        pending = null;
        setPendingFlag(false);
        if (target != null) navigate(target, { reason: "debounce" });
      }, options.debounceMs);
    },
    flushNow(state) {
      clearTimer();
      pending = null;
      setPendingFlag(false);
      navigate(state, { reason: "flushNow" });
    },
    flushPending() {
      if (pending == null) return false;
      const target = pending;
      clearTimer();
      pending = null;
      setPendingFlag(false);
      navigate(target, { reason: "flushPending" });
      return true;
    },
    cancel() {
      const wasPending = timer != null || pending != null;
      clearTimer();
      pending = null;
      if (wasPending) setPendingFlag(false);
    },
    setNavigate(next) {
      navigate = next;
    },
    peekPending() {
      return pending;
    },
    isPending() {
      return timer != null;
    },
  };
}
