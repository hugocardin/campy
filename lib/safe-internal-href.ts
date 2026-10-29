import { stripLocalePrefix } from "@/lib/locale-path";
import { routes } from "@/lib/routes";

function isUnsafeRelativePath(pathname: string): boolean {
  return (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.startsWith("/\\") ||
    pathname.includes("://") ||
    pathname.includes("\\") ||
    /[\u0000-\u001f\u007f\s]/.test(pathname)
  );
}

/**
 * Accept only same-origin relative paths for post-auth redirects.
 * Strips a leading locale so next-intl `redirect({ href })` can re-prefix.
 */
export function toSafeInternalHref(
  candidate: string | null | undefined,
  fallback: string = routes.profile(),
): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return fallback;
  }

  if (isUnsafeRelativePath(candidate)) {
    return fallback;
  }

  const hashIndex = candidate.indexOf("#");
  const withoutHash =
    hashIndex === -1 ? candidate : candidate.slice(0, hashIndex);

  const queryIndex = withoutHash.indexOf("?");
  const pathname =
    queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : withoutHash.slice(queryIndex);

  let normalized = stripLocalePrefix(pathname);
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  // Re-check after locale strip so `/en-CA//evil` cannot become `//evil`.
  if (isUnsafeRelativePath(normalized) || isUnsafeRelativePath(`${normalized}${search}`)) {
    return fallback;
  }

  // Avoid redirect loops back to the auth page.
  if (normalized === routes.auth() || normalized.startsWith(`${routes.auth()}/`)) {
    return fallback;
  }

  return `${normalized}${search}`;
}
