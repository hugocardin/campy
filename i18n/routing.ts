import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en-CA", "fr-CA"], // add "en-US" and "es-US" later
  defaultLocale: "en-CA", // since starting in Canada
  localePrefix: "as-needed", // or 'as-needed' to hide default prefix
  // Optional: domain-based routing later (ca.yoursite.com → en-CA/fr-CA)
  // domains: [ ... ]
});
