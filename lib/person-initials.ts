/**
 * Avatar initials from a free-form display name (or email fallback).
 * Uses first grapheme of the first and last whitespace-separated words; max 2.
 */
export function getInitials(
  name: string | null | undefined,
  emailFallback?: string | null,
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return fallbackInitial(emailFallback);
    }
    const first = firstGrapheme(words[0]);
    if (words.length === 1) {
      return first.toUpperCase();
    }
    const last = firstGrapheme(words[words.length - 1]);
    return `${first}${last}`.toUpperCase();
  }
  return fallbackInitial(emailFallback);
}

function fallbackInitial(emailFallback: string | null | undefined): string {
  const email = (emailFallback ?? "").trim();
  if (!email) return "?";
  return firstGrapheme(email).toUpperCase() || "?";
}

function firstGrapheme(value: string): string {
  if (!value) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    for (const { segment } of segmenter.segment(value)) {
      return segment;
    }
    return "";
  }
  // Node without Segmenter: Array.from splits by code point (good enough for
  // astral emoji; combining marks may still pair poorly).
  return Array.from(value)[0] ?? "";
}
