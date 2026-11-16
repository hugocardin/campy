import {
  PROTECTED_HOOKUP_AMENITY_CODES,
  type ProtectedHookupAmenityCode,
} from "@/lib/amenities/hookup-codes";

export type CampgroundSort =
  | "name"
  | "name-desc"
  | "city"
  | "province"
  | "distance";

/** Allowed Near-me radius presets (km). */
export const CAMPGROUND_RADIUS_KM_PRESETS = [25, 50, 100] as const;
export type CampgroundRadiusKm = (typeof CAMPGROUND_RADIUS_KM_PRESETS)[number];
export const DEFAULT_CAMPGROUND_RADIUS_KM: CampgroundRadiusKm = 50;

/** ~1 km privacy rounding for URL / logs (2 decimal degrees). */
export const CAMPGROUND_GEO_COORD_DECIMALS = 2;

/** Stable amenity `code` values mapped to guest hookup filters. */
export const HOOKUP_AMENITY_CODES = {
  electricity: PROTECTED_HOOKUP_AMENITY_CODES[0],
  water: PROTECTED_HOOKUP_AMENITY_CODES[1],
  sewer: PROTECTED_HOOKUP_AMENITY_CODES[2],
} as const satisfies Record<string, ProtectedHookupAmenityCode>;

export type HookupFilterKey = keyof typeof HOOKUP_AMENITY_CODES;

export type CampgroundHookupFilters = {
  electricity: boolean;
  water: boolean;
  sewer: boolean;
};

export type CampgroundListFilters = {
  q?: string;
  sort?: CampgroundSort;
  province?: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
  electricity?: boolean;
  water?: boolean;
  sewer?: boolean;
};

export type CampgroundGeo = {
  lat: number;
  lng: number;
  radiusKm: CampgroundRadiusKm;
};

export const CAMPGROUND_SORT_CONFIG: Record<
  Exclude<CampgroundSort, "distance">,
  { column: "name" | "city" | "province"; ascending: boolean }
> = {
  name: { column: "name", ascending: true },
  "name-desc": { column: "name", ascending: false },
  city: { column: "city", ascending: true },
  province: { column: "province", ascending: true },
};

export function parseCampgroundSort(
  value: string | undefined,
  options?: { geoActive?: boolean },
): CampgroundSort {
  if (value === "distance") {
    return options?.geoActive ? "distance" : "name";
  }
  if (value && Object.hasOwn(CAMPGROUND_SORT_CONFIG, value)) {
    return value as Exclude<CampgroundSort, "distance">;
  }
  // Geo default: closest first. Non-geo default: name A–Z.
  return options?.geoActive ? "distance" : "name";
}

/** Default sort for the current mode — omit from the URL when active. */
export function defaultCampgroundSort(geoActive: boolean): CampgroundSort {
  return geoActive ? "distance" : "name";
}

/**
 * Sort value to put in the URL, or `undefined` to omit (mode default).
 * Geo default is distance; non-geo default is name — so geo + name must
 * keep `sort=name` so it round-trips.
 */
export function campgroundSortQueryValue(
  sort: CampgroundSort,
  geoActive: boolean,
): string | undefined {
  return sort !== defaultCampgroundSort(geoActive) ? sort : undefined;
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

/** Round lat/lng for privacy (~1 km at mid-latitudes with 2 decimals). */
export function roundCampgroundCoord(
  value: number,
  decimals: number = CAMPGROUND_GEO_COORD_DECIMALS,
): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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
 * Single source of truth for geo validation (page + data layer).
 * Rounds lat/lng to {@link CAMPGROUND_GEO_COORD_DECIMALS}.
 * Rejects Null Island (0,0) the same way the map does.
 */
export function validateCampgroundGeo(
  lat: number | undefined,
  lng: number | undefined,
  radiusKm: number | undefined,
): CampgroundGeo | undefined {
  if (lat == null || lng == null || radiusKm == null) return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm)) {
    return undefined;
  }
  if (!(CAMPGROUND_RADIUS_KM_PRESETS as readonly number[]).includes(radiusKm)) {
    return undefined;
  }
  const roundedLat = roundCampgroundCoord(lat);
  const roundedLng = roundCampgroundCoord(lng);
  if (Math.abs(roundedLat) > 90 || Math.abs(roundedLng) > 180) return undefined;
  if (roundedLat === 0 && roundedLng === 0) return undefined;
  return {
    lat: roundedLat,
    lng: roundedLng,
    radiusKm: radiusKm as CampgroundRadiusKm,
  };
}

/**
 * Parse lat/lng/radiusKm URL params. All three must be valid or geo is inactive.
 */
export function parseCampgroundGeo(params: {
  lat?: string;
  lng?: string;
  radiusKm?: string;
}): CampgroundGeo | undefined {
  return validateCampgroundGeo(
    parseFiniteNumber(params.lat),
    parseFiniteNumber(params.lng),
    parseCampgroundRadiusKm(params.radiusKm),
  );
}

export function campgroundRadiusMeters(radiusKm: number): number {
  return radiusKm * 1000;
}

/** Format distance_m for cards (whole km, min 1 when > 0). */
export function formatDistanceKm(distanceM: number | null | undefined): string | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM < 0) {
    return null;
  }
  const km = distanceM / 1000;
  if (km < 1) return "<1";
  return String(Math.round(km));
}

/**
 * URL hookup flags: only `1` is true (reject `true` / `yes` / other truthy junk).
 */
export function parseHookupFlag(value: string | undefined): boolean {
  return value === "1";
}

export function parseCampgroundHookups(params: {
  electricity?: string;
  water?: string;
  sewer?: string;
}): CampgroundHookupFilters {
  return {
    electricity: parseHookupFlag(params.electricity),
    water: parseHookupFlag(params.water),
    sewer: parseHookupFlag(params.sewer),
  };
}

export function anyHookupFilterActive(
  hookups: CampgroundHookupFilters,
): boolean {
  return hookups.electricity || hookups.water || hookups.sewer;
}
