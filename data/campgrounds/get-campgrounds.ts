import { Campground } from "@/entities/campground";
import {
  distinctProvinceRaws,
  provinceMatchValues,
  resolveProvinceCode,
  uniqueProvinceFilterKeys,
} from "@/lib/canadian-provinces";
import {
  CAMPGROUND_COLUMN_SORT_CONFIG,
  CampgroundSiteFilters,
  CampgroundSort,
  SEARCH_CAMPGROUNDS_LIMIT,
  campgroundRadiusMeters,
  formatCampgroundAmpsParam,
  isCampgroundPriceSort,
  parseCampgroundSiteFilters,
  parseCampgroundSort,
  sanitizeCampgroundSearchTerm,
  validateCampgroundGeo,
} from "@/lib/campground-search";
import { formatGuestMaxPriceParam } from "@/lib/campground-price";
import { formatDrivewayUrlParam } from "@/lib/driveway-type";
import { electricityAmpsToRpcArg } from "@/lib/electricity-amps";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { formatGuestSiteTypesParam } from "@/lib/guest-site-types";
import { formatGuestRigLengthParam } from "@/lib/site-rig-length";
import { formatStayKindParam } from "@/lib/stay-kind";
import { getSupabaseAnon } from "@/lib/supabase/anon-server";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/** Tag for province DISTINCT cache — revalidate on campground writes. */
export const CAMPGROUND_PROVINCES_CACHE_TAG = "campground-provinces";

export type { CampgroundListFilters, CampgroundSort } from "@/lib/campground-search";
export { parseCampgroundSort } from "@/lib/campground-search";

export type CampgroundSearchPayload = {
  campgrounds: Campground[];
  /**
   * True when the RPC/query returned more than SEARCH_CAMPGROUNDS_LIMIT
   * (probed with LIMIT+1; must stay ≤ SEARCH_CAMPGROUNDS_RPC_MAX — asserted in tests).
   */
  truncated: boolean;
};

/** Guest-safe columns — never select commission_* from v_campgrounds. */
export const GUEST_CAMPGROUND_COLUMNS =
  "id, name, description, address, city, province, country, latitude, longitude, website, phone" as const;

type CampgroundRow = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  distance_m?: number | null;
  min_price_per_night?: number | null;
};

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toCampgroundDomain(row: CampgroundRow): Campground {
  const lat = toFiniteNumber(row.latitude);
  const lng = toFiniteNumber(row.longitude);
  const location =
    lat != null && lng != null ? { lat, lng } : null;
  const distanceMeters =
    row.distance_m == null ? undefined : toFiniteNumber(row.distance_m);
  const minPrice =
    row.min_price_per_night == null
      ? undefined
      : toFiniteNumber(Number(row.min_price_per_night));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    location,
    distanceMeters: distanceMeters ?? undefined,
    minPricePerNight: minPrice ?? undefined,
    website: row.website ?? "",
    phone: row.phone ?? "",
  };
}

/** Stable name+id tie-break (matches SQL `lower(name), id`). */
function compareCampgroundNameId(a: Campground, b: Campground): number {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

function sortCampgrounds(
  campgrounds: Campground[],
  sort: CampgroundSort,
): Campground[] {
  if (sort === "distance") {
    return [...campgrounds].sort((a, b) => {
      const ad = a.distanceMeters;
      const bd = b.distanceMeters;
      if (ad == null && bd == null) return compareCampgroundNameId(a, b);
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad !== bd) return ad - bd;
      return compareCampgroundNameId(a, b);
    });
  }

  if (isCampgroundPriceSort(sort)) {
    const dir = sort === "price" ? 1 : -1;
    return [...campgrounds].sort((a, b) => {
      const ap = a.minPricePerNight;
      const bp = b.minPricePerNight;
      if (ap == null && bp == null) return compareCampgroundNameId(a, b);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (ap !== bp) return (ap - bp) * dir;
      return compareCampgroundNameId(a, b);
    });
  }

  const columnSort =
    sort === "name" ||
    sort === "name-desc" ||
    sort === "city" ||
    sort === "province"
      ? sort
      : ("name" as const);
  const { column, ascending } = CAMPGROUND_COLUMN_SORT_CONFIG[columnSort];
  const dir = ascending ? 1 : -1;
  return [...campgrounds].sort((a, b) => {
    const av = (a[column] ?? "").toString();
    const bv = (b[column] ?? "").toString();
    const primary =
      av.localeCompare(bv, "en", { sensitivity: "base" }) * dir;
    if (primary !== 0) return primary;
    return compareCampgroundNameId(a, b);
  });
}

/**
 * Cross-request DISTINCT province spellings via RPC + `unstable_cache`.
 * Cookie-free anon client so the cache closure stays request-agnostic.
 */
const fetchCampgroundProvinceRawsCached = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = getSupabaseAnon();
    const result = await handleDbResponse(
      supabase.rpc("list_campground_province_raws"),
    );
    if (!result.success) {
      throw new Error(
        `list_campground_province_raws failed: ${result.errorCode}`,
      );
    }
    // RPC returns SETOF text — rows may be plain strings or { list_... }.
    const values = (result.data as unknown[]).map((row) => {
      if (typeof row === "string") return row;
      if (row && typeof row === "object") {
        const vals = Object.values(row as Record<string, unknown>);
        const first = vals[0];
        return typeof first === "string" ? first : null;
      }
      return null;
    });
    return distinctProvinceRaws(values);
  },
  ["campground-province-raws"],
  { revalidate: 3600, tags: [CAMPGROUND_PROVINCES_CACHE_TAG] },
);

/**
 * Exact distinct province strings (padding preserved).
 * Used to expand alias lists for RPCs that match with lower(btrim).
 */
const getCampgroundProvinceRaws = cache(
  async (): Promise<ActionResult<string[]>> => {
    try {
      const raws = await fetchCampgroundProvinceRawsCached();
      return resultSuccess(raws);
    } catch (err) {
      console.warn(
        "[getCampgroundProvinceRaws] DISTINCT RPC/cache failed; static aliases only",
        err,
      );
      return handleUnexpectedError(err);
    }
  },
);

/**
 * Distinct province filter keys (canonical codes when known). Labels are
 * locale-aware in the UI; matching expands aliases — see canadian-provinces.
 */
export const getCampgroundProvinces = cache(
  async (): Promise<ActionResult<string[]>> => {
    const raws = await getCampgroundProvinceRaws();
    if (!raws.success) {
      console.warn(
        "[getCampgroundProvinces] falling back to empty keys after raws failure",
      );
      return raws;
    }
    return resultSuccess(uniqueProvinceFilterKeys(raws.data));
  },
);

function siteFilterRpcArgs(filters: CampgroundSiteFilters) {
  return {
    require_amps: electricityAmpsToRpcArg(filters.amps),
    require_water: filters.water,
    require_sewer: filters.sewer,
    require_dump_station: filters.dumpStation,
    require_driveway_type: filters.drivewayType ?? null,
    min_rig_length: filters.rigLength ?? null,
    stay_kind: filters.stayKind ?? null,
    require_site_types:
      filters.siteTypes.length > 0 ? filters.siteTypes : null,
    max_price: filters.maxPrice ?? null,
  };
}

/**
 * Canonical primitive for React `cache` — URL-shaped site/park filter string.
 * Built by {@link buildCampgroundSiteFiltersCacheKey}.
 */
export function buildCampgroundSiteFiltersCacheKey(
  filters: CampgroundSiteFilters,
): string {
  const params = new URLSearchParams();
  const amps = formatCampgroundAmpsParam(filters.amps);
  if (amps) params.set("amps", amps);
  if (filters.water) params.set("water", "1");
  if (filters.sewer) params.set("sewer", "1");
  if (filters.dumpStation) params.set("dump", "1");
  const driveway = formatDrivewayUrlParam(filters.drivewayType);
  if (driveway) params.set("driveway", driveway);
  const stay = formatStayKindParam(filters.stayKind);
  if (stay) params.set("stay", stay);
  const rig = formatGuestRigLengthParam(filters.rigLength);
  if (rig) params.set("rigLength", rig);
  const types = formatGuestSiteTypesParam(filters.siteTypes);
  if (types) params.set("types", types);
  const maxPrice = formatGuestMaxPriceParam(filters.maxPrice);
  if (maxPrice) params.set("maxPrice", maxPrice);
  return params.toString();
}

function parseSiteFiltersCacheKey(key: string): CampgroundSiteFilters {
  const params = new URLSearchParams(key);
  return parseCampgroundSiteFilters({
    amps: params.get("amps") ?? undefined,
    water: params.get("water") ?? undefined,
    sewer: params.get("sewer") ?? undefined,
    dump: params.get("dump") ?? undefined,
    driveway: params.get("driveway") ?? undefined,
    rigLength: params.get("rigLength") ?? undefined,
    stay: params.get("stay") ?? undefined,
    types: params.get("types") ?? undefined,
    maxPrice: params.get("maxPrice") ?? undefined,
  });
}

/**
 * Primitives (not an object) so React `cache` can dedupe by argument identity.
 * `siteFiltersKey` is one canonical URL-shaped filter string (avoids a growing
 * list of adjacent booleans/strings that can be swapped at call sites).
 */
export const getCampgrounds = cache(
  async (
    q?: string,
    sort: CampgroundSort = "name",
    province?: string,
    lat?: number,
    lng?: number,
    radiusKm?: number,
    siteFiltersKey = "",
  ): Promise<ActionResult<CampgroundSearchPayload>> => {
    try {
      const supabase = await createClient();
      const geo = validateCampgroundGeo(lat, lng, radiusKm);
      const resolvedSort = parseCampgroundSort(sort, {
        geoActive: Boolean(geo),
      });
      const term = q ? sanitizeCampgroundSearchTerm(q) : "";
      // Unknown / malicious ?province= is ignored (All provinces).
      const provinceCode = resolveProvinceCode(province);
      const siteFilters = parseSiteFiltersCacheKey(siteFiltersKey);

      let provinceAliases: string[] = [];
      if (provinceCode) {
        // Exact DB spellings + static aliases → RPC text[] (lower(btrim) match).
        // Never send raws through PostgREST `.in()` URL serialization.
        const raws = await getCampgroundProvinceRaws();
        if (!raws.success) {
          console.warn(
            "[getCampgrounds] province raws failed; using static aliases only",
            provinceCode,
            raws.errorCode,
          );
        }
        const rawDb = raws.success ? raws.data : [];
        provinceAliases = provinceMatchValues(provinceCode, rawDb);
      }

      if (geo) {
        const result = await handleDbResponse(
          supabase.rpc("search_campgrounds_near", {
            lat: geo.lat,
            lng: geo.lng,
            radius_m: campgroundRadiusMeters(geo.radiusKm),
            q: term || null,
            province_aliases:
              provinceAliases.length > 0 ? provinceAliases : null,
            ...siteFilterRpcArgs(siteFilters),
            // Always distance-ordered in SQL (cap after that). App may
            // re-sort the capped set for other keys — truncation still means
            // "more within radius", not "more in name/price order".
            result_limit: SEARCH_CAMPGROUNDS_LIMIT + 1,
          }),
        );

        if (!result.success) {
          return result;
        }

        let rows = (result.data as CampgroundRow[]).map(toCampgroundDomain);
        const truncated = rows.length > SEARCH_CAMPGROUNDS_LIMIT;
        if (truncated) {
          rows = rows.slice(0, SEARCH_CAMPGROUNDS_LIMIT);
        }
        // Near RPC is SQL-ordered by distance; only re-sort for other keys
        // (on the already-capped nearest set).
        if (resolvedSort !== "distance") {
          rows = sortCampgrounds(rows, resolvedSort);
        }
        return resultSuccess({ campgrounds: rows, truncated });
      }

      const nonGeoSort =
        resolvedSort === "distance" ? ("name" as const) : resolvedSort;

      // Always use search_campgrounds for non-geo (#24/#40): unaccent/trigram,
      // site filters, min_price_per_night, ORDER BY + LIMIT in SQL.
      // RPC defers min_price to post-LIMIT when not site-filtering / price-sorting
      // (sites already indexed on campground_id). Trust SQL order (no JS re-sort).
      // Fetch limit+1 to detect truncation.
      const result = await handleDbResponse(
        supabase.rpc("search_campgrounds", {
          q: term || null,
          province_aliases:
            provinceAliases.length > 0 ? provinceAliases : null,
          ...siteFilterRpcArgs(siteFilters),
          sort_key: nonGeoSort,
          result_limit: SEARCH_CAMPGROUNDS_LIMIT + 1,
        }),
      );

      if (!result.success) {
        return result;
      }

      const mapped = (result.data as CampgroundRow[]).map(toCampgroundDomain);
      const truncated = mapped.length > SEARCH_CAMPGROUNDS_LIMIT;
      const campgrounds = truncated
        ? mapped.slice(0, SEARCH_CAMPGROUNDS_LIMIT)
        : mapped;
      return resultSuccess({ campgrounds, truncated });
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
