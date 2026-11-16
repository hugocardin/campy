import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin_server";

/**
 * Photon proxy fair-use limiter (#24 / #39).
 * Shared gate via service-role `photon_proxy_admit` (hard-coded caps in SQL).
 * Falls back to process-local buckets when the RPC is unavailable.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 2000;

/** Per-IP: ~1 req / 500 ms, burst 8 (must match SQL hard-codes). */
export const IP_CAPACITY = 8;
export const IP_REFILL_PER_MS = 1 / 500;

/** Global upstream cap: ~10 req/s, burst 40 (must match SQL hard-codes). */
export const UPSTREAM_CAPACITY = 40;
export const UPSTREAM_REFILL_PER_MS = 1 / 100;

export const GLOBAL_CAPACITY = UPSTREAM_CAPACITY;
export const GLOBAL_REFILL_PER_MS = UPSTREAM_REFILL_PER_MS;

export const PHOTON_UPSTREAM_BUCKET_KEY = "photon:upstream";

export type PhotonAdmitStatus = "ok" | "circuit_open" | "limited";

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

/**
 * Normalize client IP for bucket keys: IPv6 → /64 prefix to bound growth.
 */
export function photonClientBucketKey(clientIp: string | null): string | null {
  if (!clientIp) return null;
  const trimmed = clientIp.trim();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    // IPv6: keep first 4 hextets (/64).
    const parts = trimmed.split(":").filter((p) => p.length > 0);
    if (parts.length >= 4) {
      return `photon:ip:${parts.slice(0, 4).join(":")}:/64`;
    }
  }
  return `photon:ip:${trimmed}`;
}

function localAdmitPhoton(clientIp: string | null): PhotonAdmitStatus {
  if (clientIp) {
    const ipKey = photonClientBucketKey(clientIp);
    if (
      ipKey &&
      !localAllow(ipKey, IP_CAPACITY, IP_REFILL_PER_MS)
    ) {
      return "limited";
    }
  }
  if (
    !localAllow(
      PHOTON_UPSTREAM_BUCKET_KEY,
      UPSTREAM_CAPACITY,
      UPSTREAM_REFILL_PER_MS,
    )
  ) {
    return "limited";
  }
  return "ok";
}

/**
 * One round trip: circuit + IP-first + upstream (service-role RPC).
 * Returns null only when the shared path failed (caller may fall back locally).
 */
export async function photonProxyAdmit(
  clientIp: string | null,
): Promise<PhotonAdmitStatus | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("photon_proxy_admit", {
      p_client_key: photonClientBucketKey(clientIp),
    });
    if (error) {
      console.warn("[geocode-rate-limit] photon_proxy_admit failed", error.message);
      return null;
    }
    if (data === "ok" || data === "circuit_open" || data === "limited") {
      return data;
    }
    console.warn("[geocode-rate-limit] unexpected admit status", data);
    return "limited";
  } catch (err) {
    console.warn("[geocode-rate-limit] photon_proxy_admit threw", err);
    return null;
  }
}

/**
 * Dual check with IP before upstream. Shared admit when available.
 */
export async function geocodeRateLimitAllowPhoton(
  clientIp: string | null,
): Promise<boolean> {
  const shared = await photonProxyAdmit(clientIp);
  if (shared != null) return shared === "ok";
  return localAdmitPhoton(clientIp) === "ok";
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
