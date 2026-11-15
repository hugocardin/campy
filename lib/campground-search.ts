export type CampgroundSort = "name" | "name-desc" | "city" | "province";

/** Allowed Near-me radius presets (km). */
export const CAMPGROUND_RADIUS_KM_PRESETS = [25, 50, 100] as const;
export type CampgroundRadiusKm = (typeof CAMPGROUND_RADIUS_KM_PRESETS)[number];
export const DEFAULT_CAMPGROUND_RADIUS_KM: CampgroundRadiusKm = 50;

export type CampgroundListFilters = {
  q?: string;
  sort?: CampgroundSort;
  province?: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
};

export type CampgroundGeo = {
  lat: number;
  lng: number;
  radiusKm: CampgroundRadiusKm;
};

export const CAMPGROUND_SORT_CONFIG: Record<
  CampgroundSort,
  { column: "name" | "city" | "province"; ascending: boolean }
> = {
  name: { column: "name", ascending: true },
  "name-desc": { column: "name", ascending: false },
  city: { column: "city", ascending: true },
  province: { column: "province", ascending: true },
};

export function parseCampgroundSort(value: string | undefined): CampgroundSort {
  if (value && Object.hasOwn(CAMPGROUND_SORT_CONFIG, value)) {
    return value as CampgroundSort;
  }
  return "name";
}

/**
 * Sanitize a free-text search term for PostgREST `.or(...ilike...)`.
 * Strips filter-grammar breakers and PostgREST/ilike wildcards (`*`, `%`, `_`).
 * Keeps apostrophes and dots so terms like `St. John's` / `L'Anse` still match.
 * Accent-insensitive match (`unaccent`) is deferred to a later RPC.
 */
export function sanitizeCampgroundSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[%_*(),\"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCampgroundRadiusKm(
  value: string | undefined,
): CampgroundRadiusKm | undefined {
  const n = parseFiniteNumber(value);
  if (n == null) return undefined;
  return (CAMPGROUND_RADIUS_KM_PRESETS as readonly number[]).includes(n)
    ? (n as CampgroundRadiusKm)
    : undefined;
}

/**
 * Parse lat/lng/radiusKm URL params. All three must be valid or geo is inactive.
 * Rejects Null Island (0,0) the same way the map does.
 */
export function parseCampgroundGeo(params: {
  lat?: string;
  lng?: string;
  radiusKm?: string;
}): CampgroundGeo | undefined {
  const lat = parseFiniteNumber(params.lat);
  const lng = parseFiniteNumber(params.lng);
  const radiusKm = parseCampgroundRadiusKm(params.radiusKm);
  if (lat == null || lng == null || radiusKm == null) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { lat, lng, radiusKm };
}

export function campgroundRadiusMeters(radiusKm: number): number {
  return radiusKm * 1000;
}
