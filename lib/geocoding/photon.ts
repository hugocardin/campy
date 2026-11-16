import "server-only";

import {
  GEOCODE_COUNTRY_ALLOWLIST,
  type GeocodeCountryCode,
  type GeocodedPlace,
  SUGGEST_PLACE_LIMIT,
} from "@/lib/geocoding/types";
import { buildPhotonSearchUrl } from "@/lib/geocoding/photon-url";

export { photonLangFromLocale } from "@/lib/geocoding/types";
export {
  buildPhotonSearchUrl,
  PHOTON_OSM_TAGS,
  PHOTON_LAYERS,
} from "@/lib/geocoding/photon-url";

/**
 * Photon (Komoot) — free OSM autocomplete, no API key.
 *
 * Why Photon (issue #24): as-you-type, fr/en names, no key for demo.
 * Rank inside North America via `bbox`, then filter CA / US / MX.
 * Layers + osm_tag cover cities/regions plus parks, lakes, postcodes.
 * Note: Photon ANDs layer with osm_tag — see PHOTON_OSM_TAGS.
 *
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
    osm_key?: string;
    osm_value?: string;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

const ALLOWED = new Set<string>(GEOCODE_COUNTRY_ALLOWLIST);

const PHOTON_TIMEOUT_MS = 3000;

function formatLabel(
  props: NonNullable<PhotonFeature["properties"]>,
): { label: string; subtitle?: string } | null {
  const name =
    props.name?.trim() ||
    props.postcode?.trim() ||
    props.city?.trim() ||
    "";
  if (!name) return null;
  const parts: string[] = [];
  if (props.state?.trim() && props.state !== name) parts.push(props.state.trim());
  if (props.country?.trim()) parts.push(props.country.trim());
  const subtitle = parts.length > 0 ? parts.join(", ") : undefined;
  return { label: name, subtitle };
}

function toPlace(feature: PhotonFeature): GeocodedPlace | null {
  const coords = feature.geometry?.coordinates;
  const props = feature.properties;
  if (!coords || !props) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const cc = props.countrycode?.toUpperCase();
  if (!cc || !ALLOWED.has(cc)) return null;

  const formatted = formatLabel(props);
  if (!formatted) return null;

  const osmType = props.osm_type ?? "x";
  const osmId = props.osm_id ?? `${lat},${lng}`;

  return {
    id: `photon:${osmType}:${osmId}`,
    label: formatted.label,
    lat,
    lng,
    countryCode: cc as GeocodeCountryCode,
    subtitle: formatted.subtitle,
  };
}

/**
 * Query Photon for place suggestions. Caller must debounce + cache.
 * Default 3s timeout when no signal is passed.
 */
export async function searchPhotonPlaces(
  query: string,
  options?: { locale?: string; limit?: number; signal?: AbortSignal },
): Promise<GeocodedPlace[]> {
  const url = buildPhotonSearchUrl(query, options);
  if (!url) return [];

  const limit = Math.min(
    Math.max(options?.limit ?? SUGGEST_PLACE_LIMIT, 1),
    10,
  );

  const signal =
    options?.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(PHOTON_TIMEOUT_MS)
      : undefined);

  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "Campy/0.1 (https://github.com/hugocardin/campy; search-suggest)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Photon HTTP ${res.status}`);
  }

  const body = (await res.json()) as PhotonResponse;
  const places: GeocodedPlace[] = [];
  const seen = new Set<string>();

  for (const feature of body.features ?? []) {
    const place = toPlace(feature);
    if (!place || seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
    if (places.length >= limit) break;
  }

  return places;
}
