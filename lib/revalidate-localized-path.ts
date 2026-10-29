import { routing } from "@/i18n/routing";
import { revalidatePath } from "next/cache";

/**
 * Revalidate a locale-unprefixed app path for every configured locale.
 *
 * With `localePrefix: "always"`, App Router pages live under `app/[locale]/...`
 * and the public URL is `/{locale}/...`. Calling `revalidatePath` with bare
 * paths from `routes.*` (no locale) can miss those cache entries.
 */
export function revalidateLocalizedPath(
  path: string,
  type?: "page" | "layout",
): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;

  for (const locale of routing.locales) {
    revalidatePath(`/${locale}${suffix}`, type);
  }
}
