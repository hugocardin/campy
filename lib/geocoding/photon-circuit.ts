import "server-only";

/**
 * Process-wide Photon circuit breaker (#24 review).
 * After repeated failures, skip upstream calls briefly so each keystroke
 * does not pay the 3s timeout during an outage.
 */

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30_000;

let recentFailures = 0;
let openUntil = 0;

export function photonCircuitIsOpen(now = Date.now()): boolean {
  return now < openUntil;
}

export function photonCircuitRecordSuccess(): void {
  recentFailures = 0;
  openUntil = 0;
}

export function photonCircuitRecordFailure(now = Date.now()): void {
  recentFailures += 1;
  if (recentFailures >= FAILURE_THRESHOLD) {
    openUntil = now + OPEN_MS;
    recentFailures = 0;
  }
}
