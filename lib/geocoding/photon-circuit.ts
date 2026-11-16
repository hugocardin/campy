import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin_server";

/**
 * Photon circuit breaker (#24 / #39).
 * Shared state via service-role RPCs; process-local fallback.
 * Success/failure recording is fire-and-forget from the suggest path.
 */

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30_000;

let recentFailures = 0;
let openUntil = 0;

function localIsOpen(now = Date.now()): boolean {
  return now < openUntil;
}

function localRecordSuccess(): void {
  recentFailures = 0;
  openUntil = 0;
}

function localRecordFailure(now = Date.now()): void {
  recentFailures += 1;
  if (recentFailures >= FAILURE_THRESHOLD) {
    openUntil = now + OPEN_MS;
    recentFailures = 0;
  }
}

/** Process-local only — shared circuit is checked inside photon_proxy_admit. */
export function photonCircuitIsOpenLocal(now = Date.now()): boolean {
  return localIsOpen(now);
}

export function photonCircuitRecordSuccess(): void {
  localRecordSuccess();
  void (async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.rpc("photon_circuit_record_success");
      if (error) {
        console.warn("[photon-circuit] success RPC failed", error.message);
      }
    } catch (err) {
      console.warn("[photon-circuit] success threw", err);
    }
  })();
}

export function photonCircuitRecordFailure(): void {
  localRecordFailure();
  void (async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.rpc("photon_circuit_record_failure");
      if (error) {
        console.warn("[photon-circuit] failure RPC failed", error.message);
      }
    } catch (err) {
      console.warn("[photon-circuit] failure threw", err);
    }
  })();
}
