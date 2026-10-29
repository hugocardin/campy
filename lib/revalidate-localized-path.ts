import { routing } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/locale-path";
import { revalidatePath } from "next/cache";

/**
 * Normalize a path to a locale-unprefixed suffix for revalidation.
 * Returns `""` for home, otherwise a leading-slash path with no query/hash
 * and no trailing slash.
 */
export function normalizeLocalizedPath(path: string): string {
  let normalized = path.trim();

  const queryIndex = normalized.indexOf("?");
  if (queryIndex !== -1) {
    normalized = normalized.slice(0, queryIndex);
  }
  const hashIndex = normalized.indexOf("#");
  if (hashIndex !== -1) {
    normalized = normalized.slice(0, hashIndex);
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = stripLocalePrefix(normalized);

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized === "/" ? "" : normalized;
}

/**
 * Revalidate a locale-unprefixed app path under `app/[locale]/...`.
 *
 * - Without `type`: revalidates each concrete `/{locale}{path}` URL
 *   (`localePrefix: "always"`).
 * - With `type`: calls once with the route pattern `/[locale]{path}` so
 *   Next can match the dynamic segment (required for layout/page patterns).
 */
export function revalidateLocalizedPath(
  path: string,
  type?: "page" | "layout",
): void {
  const suffix = normalizeLocalizedPath(path);

  if (type) {
    revalidatePath(`/[locale]${suffix}`, type);
    return;
  }

  for (const locale of routing.locales) {
    revalidatePath(`/${locale}${suffix}`);
  }
}
