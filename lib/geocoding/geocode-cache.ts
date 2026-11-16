import "server-only";

/**
 * Process-local TTL cache for Photon queries (issue #24 free-tier hygiene).
 * Survives across requests in a warm Node process; not shared across instances.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry<unknown>>();

function prune(now: number) {
  if (store.size <= MAX_ENTRIES) return;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  if (store.size <= MAX_ENTRIES) return;
  // Drop oldest insertion order until under cap.
  const overflow = store.size - MAX_ENTRIES;
  let i = 0;
  for (const key of store.keys()) {
    store.delete(key);
    i += 1;
    if (i >= overflow) break;
  }
}

export function geocodeCacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function geocodeCacheSet<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const now = Date.now();
  store.set(key, { value, expiresAt: now + ttlMs });
  prune(now);
}

/** Test helper — not used in production paths. */
export function geocodeCacheClear(): void {
  store.clear();
}
