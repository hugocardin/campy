import "server-only";

import { getSupabaseAnon } from "@/lib/supabase/anon-server";

/**
 * Photon circuit breaker (#24).
 * Prefers shared `photon_circuit_*` RPCs; falls back to process-local state.
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

export async function photonCircuitIsOpen(): Promise<boolean> {
  try {
    const supabase = getSupabaseAnon();
    const { data, error } = await supabase.rpc("photon_circuit_is_open");
    if (error) {
      console.warn("[photon-circuit] is_open RPC failed", error.message);
      return localIsOpen();
    }
    return data === true;
  } catch (err) {
    console.warn("[photon-circuit] is_open threw", err);
    return localIsOpen();
  }
}

export async function photonCircuitRecordSuccess(): Promise<void> {
  localRecordSuccess();
  try {
    const supabase = getSupabaseAnon();
    const { error } = await supabase.rpc("photon_circuit_record_success");
    if (error) {
      console.warn("[photon-circuit] success RPC failed", error.message);
    }
  } catch (err) {
    console.warn("[photon-circuit] success threw", err);
  }
}

export async function photonCircuitRecordFailure(): Promise<void> {
  localRecordFailure();
  try {
    const supabase = getSupabaseAnon();
    const { error } = await supabase.rpc("photon_circuit_record_failure", {
      p_threshold: FAILURE_THRESHOLD,
      p_open_ms: OPEN_MS,
    });
    if (error) {
      console.warn("[photon-circuit] failure RPC failed", error.message);
    }
  } catch (err) {
    console.warn("[photon-circuit] failure threw", err);
  }
}
