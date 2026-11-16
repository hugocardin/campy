import "server-only";

import { getSupabaseAnon } from "@/lib/supabase/anon-server";

/**
 * Photon proxy fair-use limiter (#24).
 * Prefers shared Supabase token buckets (`geocode_rate_limit_take`); falls
 * back to process-local buckets when the RPC is unavailable.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 2000;

/** Per-IP: ~1 req / 500 ms, burst 8. */
export const IP_CAPACITY = 8;
export const IP_REFILL_PER_MS = 1 / 500;

/** Global upstream cap (all clients): ~10 req/s, burst 40. */
export const UPSTREAM_CAPACITY = 40;
export const UPSTREAM_REFILL_PER_MS = 1 / 100;

/** Legacy alias when IP is unknown — same shape as upstream. */
export const GLOBAL_CAPACITY = UPSTREAM_CAPACITY;
export const GLOBAL_REFILL_PER_MS = UPSTREAM_REFILL_PER_MS;

export const PHOTON_UPSTREAM_BUCKET_KEY = "photon:upstream";

function localAllow(
  key: string,
  capacity: number,
  refillPerMs: number,
): boolean {
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_KEYS) {
      const first = buckets.keys().next().value;
      if (first != null) buckets.delete(first);
    }
    bucket = { tokens: capacity, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}

async function sharedAllow(
  key: string,
  capacity: number,
  refillPerMs: number,
): Promise<boolean | null> {
  try {
    const supabase = getSupabaseAnon();
    const { data, error } = await supabase.rpc("geocode_rate_limit_take", {
      p_key: key,
      p_capacity: capacity,
      p_refill_per_ms: refillPerMs,
    });
    if (error) {
      console.warn("[geocode-rate-limit] shared RPC failed", error.message);
      return null;
    }
    return data === true;
  } catch (err) {
    console.warn("[geocode-rate-limit] shared RPC threw", err);
    return null;
  }
}

/**
 * Take one token from a named bucket. Tries shared storage first.
 */
export async function geocodeRateLimitAllow(
  key: string,
  options?: { capacity?: number; refillPerMs?: number },
): Promise<boolean> {
  const capacity = options?.capacity ?? IP_CAPACITY;
  const refill = options?.refillPerMs ?? IP_REFILL_PER_MS;

  const shared = await sharedAllow(key, capacity, refill);
  if (shared != null) return shared;
  return localAllow(key, capacity, refill);
}

/**
 * Dual check: global upstream Photon cap AND per-client IP bucket.
 * When IP is unknown, only the upstream bucket is enforced (avoid stacking
 * two identical global keys).
 */
export async function geocodeRateLimitAllowPhoton(
  clientIp: string | null,
): Promise<boolean> {
  const upstreamOk = await geocodeRateLimitAllow(PHOTON_UPSTREAM_BUCKET_KEY, {
    capacity: UPSTREAM_CAPACITY,
    refillPerMs: UPSTREAM_REFILL_PER_MS,
  });
  if (!upstreamOk) return false;

  if (!clientIp) return true;

  return geocodeRateLimitAllow(`photon:ip:${clientIp}`, {
    capacity: IP_CAPACITY,
    refillPerMs: IP_REFILL_PER_MS,
  });
}

/** Sync process-local take — tests / emergency only. */
export function geocodeRateLimitAllowLocal(
  key: string,
  options?: { global?: boolean },
): boolean {
  const capacity = options?.global ? GLOBAL_CAPACITY : IP_CAPACITY;
  const refill = options?.global ? GLOBAL_REFILL_PER_MS : IP_REFILL_PER_MS;
  return localAllow(key, capacity, refill);
}
