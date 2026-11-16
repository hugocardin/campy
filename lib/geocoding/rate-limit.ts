import "server-only";

/**
 * Cheap process-local token bucket for Photon proxy fair-use (#24 review).
 * Not shared across instances — demo-scale only; park a real limiter for launch.
 */

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 2000;

/** ~1 request / 500 ms sustained, burst 8. */
const CAPACITY = 8;
const REFILL_PER_MS = 1 / 500;

export function geocodeRateLimitAllow(key: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_KEYS) {
      // Drop an arbitrary old key.
      const first = buckets.keys().next().value;
      if (first != null) buckets.delete(first);
    }
    bucket = { tokens: CAPACITY, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}
