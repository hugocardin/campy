/** Place suggestion from the geocoding provider (Photon). */
export type GeocodedPlace = {
  /** Stable id for list keys (provider + osm ids). */
  id: string;
  /** User-facing label (localized when the provider supports it). */
  label: string;
  lat: number;
  lng: number;
  /** ISO country code when known (CA / US / MX). */
  countryCode?: string;
  /** Optional secondary line (state / county). */
  subtitle?: string;
};

export type CampgroundSuggestion = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
};

export type SearchSuggestion =
  | ({ kind: "place" } & GeocodedPlace)
  | ({ kind: "campground" } & CampgroundSuggestion);

export const GEOCODE_COUNTRY_ALLOWLIST = ["CA", "US", "MX"] as const;
export type GeocodeCountryCode = (typeof GEOCODE_COUNTRY_ALLOWLIST)[number];

export const SUGGEST_MIN_CHARS = 3;
export const SUGGEST_DEBOUNCE_MS = 250;
export const SUGGEST_PLACE_LIMIT = 5;
export const SUGGEST_CAMPGROUND_LIMIT = 5;

/** Photon `lang` from next-intl locale (fr-CA → fr). */
export function photonLangFromLocale(locale: string): "en" | "fr" {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}
