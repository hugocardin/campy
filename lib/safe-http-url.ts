/**
 * Normalize a user/DB website value to an http(s) URL, or null if unsafe/invalid.
 * Bare hosts (`www.example.com`, `parc.ca:8080`) get an `https://` prefix.
 * Non-http schemes (`javascript:`, `data:`, `mailto:`) are rejected.
 */
export function toSafeHttpUrl(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Protocol-relative URLs are ambiguous / easy to misuse.
  if (trimmed.startsWith("//")) return null;

  const lower = trimmed.toLowerCase();
  let candidate: string;

  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    candidate = trimmed;
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed)) {
    // Looks like a scheme (`javascript:…`, `mailto:…`), not `host:port`.
    return null;
  } else {
    candidate = `https://${trimmed}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
