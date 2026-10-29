import { routing } from "@/i18n/routing";

/** Regex that strips a leading `/{locale}` segment for any configured locale. */
export const localePrefixPattern = new RegExp(
  `^/(?:${routing.locales
    .map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(?=/|$)`,
  "i",
);

export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(localePrefixPattern, "") || "/";
}
