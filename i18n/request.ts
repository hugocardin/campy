import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { hasLocale } from "next-intl";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Fallback + type narrowing
  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  // Load all namespaces in parallel (very efficient)
  const [
    adminDashboard,
    amenities,
    amenityCategories,
    auth,
    campgrounds,
    common,
    profile,
    search,
    sites,
  ] = await Promise.all([
    import(`../messages/${locale}/adminDashboard.json`).then((m) => m.default),
    import(`../messages/${locale}/amenities.json`).then((m) => m.default),
    import(`../messages/${locale}/amenityCategories.json`).then(
      (m) => m.default,
    ),
    import(`../messages/${locale}/auth.json`).then((m) => m.default),
    import(`../messages/${locale}/campgrounds.json`).then((m) => m.default),
    import(`../messages/${locale}/common.json`).then((m) => m.default),
    import(`../messages/${locale}/profile.json`).then((m) => m.default),
    import(`../messages/${locale}/search.json`).then((m) => m.default),
    import(`../messages/${locale}/sites.json`).then((m) => m.default),
  ]);

  return {
    locale,
    messages: {
      adminDashboard,
      amenities,
      amenityCategories,
      auth,
      campgrounds,
      common,
      profile,
      search,
      sites,
    },
  };
});
