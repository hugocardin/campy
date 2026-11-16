import "server-only";

/**
 * Best-effort client IP for demo rate limiting (#24).
 *
 * Prefer platform-trusted headers first (`x-vercel-forwarded-for`, `x-real-ip`).
 * For `x-forwarded-for`, use the **right-most** hop — many proxies append the
 * peer address, while the left-most entry is client-spoofable. Returns null
 * when unknown so callers can use a separate global bucket instead of sharing
 * a tiny `"unknown"` key.
 */
export function clientIpFromHeaders(headerStore: Headers): string | null {
  const vercel = headerStore.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;

  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = headerStore.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1] ?? null;
    }
  }

  return null;
}
