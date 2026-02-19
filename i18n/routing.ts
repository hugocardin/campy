import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en-CA", "fr-CA"],
  defaultLocale: "en-CA",
  localePrefix: "always",
  // Optional: domain-based routing later (ca.yoursite.com → en-CA/fr-CA)
  // domains: [ ... ]
});
