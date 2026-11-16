import "server-only";

import {
  GEOCODE_COUNTRY_ALLOWLIST,
  type GeocodeCountryCode,
  type GeocodedPlace,
  SUGGEST_PLACE_LIMIT,
  photonLangFromLocale,
} from "@/lib/geocoding/types";

export { photonLangFromLocale } from "@/lib/geocoding/types";

/**
 * Photon (Komoot) — free OSM autocomplete, no API key.
 *
 * Why Photon (issue #24 open decision):
 * - Designed for as-you-type suggestions (Nominatim discourages that).
 * - French / English via `lang` (Québec keeps accents).
 * - No key for demo / CI; swap later for Mapbox/Geoapify/LocationIQ if needed.
 * - We filter to CA / US / MX client-side (Photon has no countrycodes param).
 *
 * Usage: identify as Campy, cache responses (see `geocode-cache.ts`), debounce UI.
 * Env override: `PHOTON_API_URL` (default https://photon.komoot.io).
 */

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number | string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
    postcode?: string;
    county?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

const ALLOWED = new Set<string>(GEOCODE_COUNTRY_ALLOWLIST);

function photonBaseUrl(): string {
  const raw = process.env.PHOTON_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://photon.komoot.io";
}

function formatLabel(
  props: NonNullable<PhotonFeature["properties"]>,
  localeLang: "en" | "fr",
): { label: string; subtitle?: string } {
  const name = props.name?.trim() || props.city?.trim() || "";
  const parts: string[] = [];
  if (props.state?.trim() && props.state !== name) parts.push(props.state.trim());
  if (props.country?.trim()) parts.push(props.country.trim());
  const subtitle = parts.length > 0 ? parts.join(", ") : undefined;
  if (!name) {
    return {
      label: subtitle ?? (localeLang === "fr" ? "Lieu" : "Place"),
      subtitle: undefined,
    };
  }
  return { label: name, subtitle };
}

function toPlace(
  feature: PhotonFeature,
  localeLang: "en" | "fr",
): GeocodedPlace | null {
  const coords = feature.geometry?.coordinates;
  const props = feature.properties;
  if (!coords || !props) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const cc = props.countrycode?.toUpperCase();
  if (!cc || !ALLOWED.has(cc)) return null;

  const osmType = props.osm_type ?? "x";
  const osmId = props.osm_id ?? `${lat},${lng}`;
  const { label, subtitle } = formatLabel(props, localeLang);

  return {
    id: `photon:${osmType}:${osmId}`,
    label,
    lat,
    lng,
    countryCode: cc as GeocodeCountryCode,
    subtitle,
  };
}

/**
 * Query Photon for place suggestions. Caller must debounce + cache.
 */
export async function searchPhotonPlaces(
  query: string,
  options?: { locale?: string; limit?: number; signal?: AbortSignal },
): Promise<GeocodedPlace[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 3) return [];

  const lang = photonLangFromLocale(options?.locale ?? "en-CA");
  const limit = Math.min(Math.max(options?.limit ?? SUGGEST_PLACE_LIMIT, 1), 10);

  const url = new URL(`${photonBaseUrl()}/api/`);
  url.searchParams.set("q", q);
  url.searchParams.set("lang", lang);
  // Fetch extra then filter by country — Photon has no countrycodes filter.
  url.searchParams.set("limit", String(Math.min(limit * 3, 15)));

  const res = await fetch(url, {
    signal: options?.signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "Campy/0.1 (https://github.com/hugocardin/campy; search-suggest)",
    },
    // Photon is public; avoid Next fetch cache dumping unbounded keys.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Photon HTTP ${res.status}`);
  }

  const body = (await res.json()) as PhotonResponse;
  const places: GeocodedPlace[] = [];
  const seen = new Set<string>();

  for (const feature of body.features ?? []) {
    const place = toPlace(feature, lang);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
    if (places.length >= limit) break;
  }

  return places;
}
