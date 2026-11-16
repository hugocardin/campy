import "server-only";

/**
 * Cheap process-local token bucket for Photon proxy fair-use (#24 review).
 * Not shared across instances — demo-scale only; shared/global limiter parked.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 2000;

/** Per-IP: ~1 req / 500 ms, burst 8. */
const IP_CAPACITY = 8;
const IP_REFILL_PER_MS = 1 / 500;

/** Global (unknown IP / site-wide): larger so local next start isn't one tiny bucket. */
const GLOBAL_CAPACITY = 40;
const GLOBAL_REFILL_PER_MS = 1 / 100;

export function geocodeRateLimitAllow(
  key: string,
  options?: { global?: boolean },
): boolean {
  const now = Date.now();
  const capacity = options?.global ? GLOBAL_CAPACITY : IP_CAPACITY;
  const refill = options?.global ? GLOBAL_REFILL_PER_MS : IP_REFILL_PER_MS;

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
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refill);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}
