import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDebouncedNavigation } from "./debounced-navigation";

type FakeTimer = {
  id: number;
  ms: number;
  fn: () => void;
};

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map<number, FakeTimer>();
  const setTimeoutFn = ((fn: () => void, ms: number) => {
    const id = nextId++;
    timers.set(id, { id, ms, fn });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  const clearTimeoutFn = ((handle: ReturnType<typeof setTimeout>) => {
    timers.delete(handle as unknown as number);
  }) as typeof clearTimeout;
  function advance(ms: number) {
    const due = [...timers.values()].filter((t) => t.ms <= ms);
    for (const t of due) {
      timers.delete(t.id);
      t.fn();
    }
  }
  return { setTimeoutFn, clearTimeoutFn, advance, timers };
}

describe("createDebouncedNavigation", () => {
  it("coalesces rapid schedule calls into one navigate with the last state", () => {
    const { setTimeoutFn, clearTimeoutFn, advance } = createFakeTimers();
    const navigated: string[] = [];
    const pendingFlags: boolean[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (s) => navigated.push(s),
      onPendingChange: (p) => pendingFlags.push(p),
      setTimeoutFn,
      clearTimeoutFn,
    });

    nav.schedule("a");
    nav.schedule("b");
    nav.schedule("c");
    assert.deepEqual(navigated, []);
    assert.equal(nav.peekPending(), "c");
    assert.equal(nav.isPending(), true);
    assert.deepEqual(pendingFlags, [true, true, true]);

    advance(600);
    assert.deepEqual(navigated, ["c"]);
    assert.equal(nav.peekPending(), null);
    assert.equal(nav.isPending(), false);
    assert.equal(pendingFlags.at(-1), false);
  });

  it("flushNow cancels a pending schedule and navigates immediately", () => {
    const { setTimeoutFn, clearTimeoutFn, advance, timers } = createFakeTimers();
    const navigated: string[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (s) => navigated.push(s),
      setTimeoutFn,
      clearTimeoutFn,
    });

    nav.schedule("pending");
    nav.flushNow("now");
    assert.deepEqual(navigated, ["now"]);
    assert.equal(nav.isPending(), false);
    assert.equal(timers.size, 0);

    advance(600);
    assert.deepEqual(navigated, ["now"]);
  });

  it("flushPending navigates the held target and is a no-op when idle", () => {
    const { setTimeoutFn, clearTimeoutFn, advance, timers } = createFakeTimers();
    const navigated: string[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (s) => navigated.push(s),
      setTimeoutFn,
      clearTimeoutFn,
    });

    assert.equal(nav.flushPending(), false);
    assert.deepEqual(navigated, []);

    nav.schedule("held");
    assert.equal(nav.flushPending(), true);
    assert.deepEqual(navigated, ["held"]);
    assert.equal(nav.isPending(), false);
    assert.equal(nav.peekPending(), null);
    assert.equal(timers.size, 0);

    advance(600);
    assert.deepEqual(navigated, ["held"]);
  });

  it("cancel drops the pending navigation without calling navigate", () => {
    const { setTimeoutFn, clearTimeoutFn, advance } = createFakeTimers();
    const navigated: string[] = [];
    const pendingFlags: boolean[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (s) => navigated.push(s),
      onPendingChange: (p) => pendingFlags.push(p),
      setTimeoutFn,
      clearTimeoutFn,
    });

    nav.schedule("x");
    nav.cancel();
    assert.deepEqual(navigated, []);
    assert.equal(nav.peekPending(), null);
    assert.equal(nav.isPending(), false);
    assert.equal(pendingFlags.at(-1), false);

    advance(600);
    assert.deepEqual(navigated, []);
  });

  it("setNavigate replaces the navigate callback for later flushes", () => {
    const { setTimeoutFn, clearTimeoutFn, advance } = createFakeTimers();
    const first: string[] = [];
    const second: string[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (s) => first.push(s),
      setTimeoutFn,
      clearTimeoutFn,
    });
    nav.setNavigate((s) => second.push(s));
    nav.schedule("later");
    advance(600);
    assert.deepEqual(first, []);
    assert.deepEqual(second, ["later"]);
  });

  it("passes reason debounce | flushPending | flushNow to navigate", () => {
    const { setTimeoutFn, clearTimeoutFn, advance } = createFakeTimers();
    const reasons: string[] = [];
    const nav = createDebouncedNavigation<string>({
      debounceMs: 600,
      navigate: (_s, meta) => reasons.push(meta.reason),
      setTimeoutFn,
      clearTimeoutFn,
    });

    nav.schedule("a");
    advance(600);
    assert.deepEqual(reasons, ["debounce"]);

    nav.schedule("b");
    assert.equal(nav.flushPending(), true);
    assert.deepEqual(reasons, ["debounce", "flushPending"]);

    nav.flushNow("c");
    assert.deepEqual(reasons, ["debounce", "flushPending", "flushNow"]);
  });
});
