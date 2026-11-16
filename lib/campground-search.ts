import {
  type SiteHookupAmenityCode,
} from "@/lib/amenities/hookup-codes";
import {
  type DrivewayType,
  parseDrivewayUrlParam,
} from "@/lib/driveway-type";
import {
  ELECTRICITY_AMP_VALUES,
  type ElectricityAmpFilterOption,
  normalizeElectricityAmpFilters,
} from "@/lib/electricity-amps";
import { parseGuestRigLength } from "@/lib/site-rig-length";
import {
  type StayKind,
  parseStayKind,
  stayKindAllowsRigLength,
} from "@/lib/stay-kind";

export type CampgroundSort =
  | "name"
  | "name-desc"
  | "city"
  | "province"
  | "distance";

/**
 * Guest list/near page size. SQL RPCs must allow at least this + 1 so the app
 * can detect truncation (`result_limit` capped at SEARCH_CAMPGROUNDS_RPC_MAX).
 */
export const SEARCH_CAMPGROUNDS_LIMIT = 200;
/** Must stay ≥ SEARCH_CAMPGROUNDS_LIMIT + 1 (see search_* RPC LIMIT clamps). */
export const SEARCH_CAMPGROUNDS_RPC_MAX = 500;

/** Allowed Near-me radius presets (km). */
export const CAMPGROUND_RADIUS_KM_PRESETS = [25, 50, 100] as const;
export type CampgroundRadiusKm = (typeof CAMPGROUND_RADIUS_KM_PRESETS)[number];
export const DEFAULT_CAMPGROUND_RADIUS_KM: CampgroundRadiusKm = 50;

/** ~1 km privacy rounding for URL / logs (2 decimal degrees). */
export const CAMPGROUND_GEO_COORD_DECIMALS = 2;

/** Stable amenity `code` values mapped to guest water/sewer filters. */
export const HOOKUP_AMENITY_CODES = {
  water: "WATER",
  sewer: "SEWER",
} as const satisfies Record<string, SiteHookupAmenityCode>;

export type HookupAmenityFilterKey = keyof typeof HOOKUP_AMENITY_CODES;

export type CampgroundHookupFilters = {
  /** Exact amp multi-select; empty = no electricity restriction. */
  amps: ElectricityAmpFilterOption[];
  water: boolean;
  sewer: boolean;
};

/** Guest site/park filters beyond geo/province (issue #25/#26/#27). */
export type CampgroundSiteFilters = CampgroundHookupFilters & {
  dumpStation: boolean;
  drivewayType?: DrivewayType;
  /** Guest rig length in canonical feet; ignored when stay is lodging. */
  rigLength?: number;
  stayKind?: StayKind;
};

export type CampgroundListFilters = {
  q?: string;
  sort?: CampgroundSort;
  province?: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
  amps?: ElectricityAmpFilterOption[];
  water?: boolean;
  sewer?: boolean;
  dumpStation?: boolean;
  drivewayType?: DrivewayType;
  rigLength?: number;
  stayKind?: StayKind;
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
 * Sanitize a free-text search term for PostgREST / RPC text filters.
 * Strips filter-grammar breakers and PostgREST/ilike wildcards (`*`, `%`, `_`).
 * Keeps apostrophes and dots so terms like `St. John's` / `L'Anse` still match.
 * Accent-insensitive match is applied in SQL via `immutable_unaccent` (#24).
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

/** Sanitize URL `place` display label (not used for RPC text match). */
export function parseCampgroundPlaceLabel(
  value: string | undefined,
): string | undefined {
  if (value == null) return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || undefined;
}

/**
 * URL hookup flags: only `1` is true (reject `true` / `yes` / other truthy junk).
 */
export function parseHookupFlag(value: string | undefined): boolean {
  return value === "1";
}

/**
 * Parse `amps` URL param: comma-separated `none` / `15` / `20` / `30` / `50`.
 * Legacy `electricity=1` (when `amps` absent) → all amp values ("any amp").
 */
export function parseCampgroundAmps(params: {
  amps?: string;
  electricity?: string;
}): ElectricityAmpFilterOption[] {
  if (params.amps != null && params.amps.trim() !== "") {
    return normalizeElectricityAmpFilters(
      params.amps.split(",").map((part) => part.trim().toLowerCase()),
    );
  }
  // Legacy yes/no electricity URL → any amp (overlap with 15|20|30|50).
  if (parseHookupFlag(params.electricity)) {
    return [...ELECTRICITY_AMP_VALUES];
  }
  return [];
}

export function parseCampgroundHookups(params: {
  amps?: string;
  electricity?: string;
  water?: string;
  sewer?: string;
}): CampgroundHookupFilters {
  return {
    amps: parseCampgroundAmps(params),
    water: parseHookupFlag(params.water),
    sewer: parseHookupFlag(params.sewer),
  };
}

/**
 * Parse dump / driveway / rig / stay URL params (issue #27).
 * Rig length and driveway are ignored when stay=lodging (cabin sites).
 */
export function parseCampgroundSiteFilters(params: {
  amps?: string;
  electricity?: string;
  water?: string;
  sewer?: string;
  dump?: string;
  driveway?: string;
  rigLength?: string;
  stay?: string;
}): CampgroundSiteFilters {
  const stayKind = parseStayKind(params.stay);
  const campingFilters = stayKindAllowsRigLength(stayKind);
  return {
    ...parseCampgroundHookups(params),
    dumpStation: parseHookupFlag(params.dump),
    drivewayType: campingFilters
      ? parseDrivewayUrlParam(params.driveway)
      : undefined,
    rigLength: campingFilters
      ? parseGuestRigLength(params.rigLength)
      : undefined,
    stayKind,
  };
}

export function anyHookupFilterActive(
  hookups: CampgroundHookupFilters,
): boolean {
  return hookups.amps.length > 0 || hookups.water || hookups.sewer;
}

export function anySiteFilterActive(filters: CampgroundSiteFilters): boolean {
  return (
    anyHookupFilterActive(filters) ||
    filters.dumpStation ||
    filters.drivewayType != null ||
    filters.rigLength != null ||
    filters.stayKind != null
  );
}

/** Serialize amp filters for URL (`none,15,30`). Empty → omit. */
export function formatCampgroundAmpsParam(
  amps: readonly ElectricityAmpFilterOption[],
): string | undefined {
  const normalized = normalizeElectricityAmpFilters(amps);
  if (normalized.length === 0) return undefined;
  return normalized.join(",");
}

