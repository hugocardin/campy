import {
  SUGGEST_PLACE_LIMIT,
  photonLangFromLocale,
} from "@/lib/geocoding/types";

/** Rough North America box so Photon ranks inside CA/US/MX. */
export const NORTH_AMERICA_BBOX = "-170,14,-50,84";

/** Locality layers + other (parks/lakes via osm_tag). */
export const PHOTON_LAYERS = [
  "city",
  "locality",
  "district",
  "county",
  "state",
  "other",
] as const;

/**
 * Photon ANDs `layer` with `osm_tag` (not OR). Include `place` +
 * `boundary:administrative` so cities/regions still match, plus park/lake tags.
 */
export const PHOTON_OSM_TAGS = [
  "place",
  "boundary:administrative",
  "boundary:protected_area",
  "leisure:park",
  "leisure:nature_reserve",
  "natural:water",
] as const;

export function photonBaseUrl(): string {
  const raw = process.env.PHOTON_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://photon.komoot.io";
}

export function clampPhotonLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? SUGGEST_PLACE_LIMIT, 1), 10);
}

/** Build the Photon API URL (no fetch — safe for unit tests). */
export function buildPhotonSearchUrl(
  query: string,
  options?: { locale?: string; limit?: number },
): { url: URL; limit: number } | null {
  const q = query.trim().slice(0, 100);
  if (q.length < 3) return null;

  const lang = photonLangFromLocale(options?.locale ?? "en-CA");
  const limit = clampPhotonLimit(options?.limit);

  const url = new URL(`${photonBaseUrl()}/api/`);
  url.searchParams.set("q", q);
  url.searchParams.set("lang", lang);
  url.searchParams.set("limit", String(Math.min(limit * 2, 10)));
  url.searchParams.set("bbox", NORTH_AMERICA_BBOX);
  for (const layer of PHOTON_LAYERS) {
    url.searchParams.append("layer", layer);
  }
  for (const tag of PHOTON_OSM_TAGS) {
    url.searchParams.append("osm_tag", tag);
  }
  return { url, limit };
}
