import { Campground } from "@/entities/campground";
import {
  distinctProvinceRaws,
  provinceMatchValues,
  resolveProvinceCode,
  uniqueProvinceFilterKeys,
} from "@/lib/canadian-provinces";
import {
  CAMPGROUND_SORT_CONFIG,
  CampgroundHookupFilters,
  CampgroundSort,
  anyHookupFilterActive,
  campgroundRadiusMeters,
  parseCampgroundSort,
  sanitizeCampgroundSearchTerm,
  validateCampgroundGeo,
} from "@/lib/campground-search";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type { CampgroundListFilters, CampgroundSort } from "@/lib/campground-search";
export { parseCampgroundSort } from "@/lib/campground-search";

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
};

function toCoord(value: number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toCampgroundDomain(row: CampgroundRow): Campground {
  const lat = toCoord(row.latitude);
  const lng = toCoord(row.longitude);
  const location =
    lat != null && lng != null ? { lat, lng } : null;
  const distanceMeters =
    row.distance_m == null ? undefined : toCoord(row.distance_m);

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
    website: row.website ?? "",
    phone: row.phone ?? "",
  };
}

function sortCampgrounds(
  campgrounds: Campground[],
  sort: CampgroundSort,
): Campground[] {
  if (sort === "distance") {
    return [...campgrounds].sort((a, b) => {
      const ad = a.distanceMeters;
      const bd = b.distanceMeters;
      if (ad == null && bd == null) return a.name.localeCompare(b.name);
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad !== bd) return ad - bd;
      return a.name.localeCompare(b.name);
    });
  }

  const { column, ascending } = CAMPGROUND_SORT_CONFIG[sort];
  const dir = ascending ? 1 : -1;
  return [...campgrounds].sort((a, b) => {
    const av = (a[column] ?? "").toString();
    const bv = (b[column] ?? "").toString();
    const primary = av.localeCompare(bv) * dir;
    if (primary !== 0) return primary;
    if (column === "name") return 0;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Exact distinct province strings from the guest view (padding preserved).
 * Used to expand alias lists for RPCs that match with lower(btrim).
 * Demo-scale full select is fine; DISTINCT RPC/view parked (#24).
 */
const getCampgroundProvinceRaws = cache(
  async (): Promise<ActionResult<string[]>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase.from("v_campgrounds").select("province"),
      );

      if (!result.success) {
        return result;
      }

      return resultSuccess(
        distinctProvinceRaws(result.data.map((row) => row.province)),
      );
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);

/**
 * Distinct province filter keys (canonical codes when known). Labels are
 * locale-aware in the UI; matching expands aliases — see canadian-provinces.
 * Follow-up: distinct view/RPC + `unstable_cache` / revalidate at scale.
 */
export const getCampgroundProvinces = cache(
  async (): Promise<ActionResult<string[]>> => {
    const raws = await getCampgroundProvinceRaws();
    if (!raws.success) {
      return raws;
    }
    return resultSuccess(uniqueProvinceFilterKeys(raws.data));
  },
);

function hookupRpcArgs(hookups: CampgroundHookupFilters) {
  return {
    require_electricity: hookups.electricity,
    require_water: hookups.water,
    require_sewer: hookups.sewer,
  };
}

/** Primitives (not an object) so React `cache` can dedupe by argument identity. */
export const getCampgrounds = cache(
  async (
    q?: string,
    sort: CampgroundSort = "name",
    province?: string,
    lat?: number,
    lng?: number,
    radiusKm?: number,
    electricity = false,
    water = false,
    sewer = false,
  ): Promise<ActionResult<Campground[]>> => {
    try {
      const supabase = await createClient();
      const geo = validateCampgroundGeo(lat, lng, radiusKm);
      const resolvedSort = parseCampgroundSort(sort, {
        geoActive: Boolean(geo),
      });
      const term = q ? sanitizeCampgroundSearchTerm(q) : "";
      // Unknown / malicious ?province= is ignored (All provinces).
      const provinceCode = resolveProvinceCode(province);
      const hookups: CampgroundHookupFilters = {
        electricity: Boolean(electricity),
        water: Boolean(water),
        sewer: Boolean(sewer),
      };
      const hookupsActive = anyHookupFilterActive(hookups);

      let provinceAliases: string[] = [];
      if (provinceCode) {
        // Exact DB spellings + static aliases → RPC text[] (lower(btrim) match).
        // Never send raws through PostgREST `.in()` URL serialization.
        const raws = await getCampgroundProvinceRaws();
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
            ...hookupRpcArgs(hookups),
          }),
        );

        if (!result.success) {
          return result;
        }

        const rows = (result.data as CampgroundRow[]).map(toCampgroundDomain);
        // RPC already ORDER BY distance; re-sort only when user picked another key.
        if (resolvedSort === "distance") {
          return resultSuccess(rows);
        }
        return resultSuccess(sortCampgrounds(rows, resolvedSort));
      }

      const nonGeoSort =
        resolvedSort === "distance" ? ("name" as const) : resolvedSort;

      // Province and/or hookups use search_campgrounds RPC (guest-safe; no PostgREST
      // amenity filter injection). RPC has no LIMIT / ORDER BY — sort in JS.
      if (provinceAliases.length > 0 || hookupsActive) {
        const result = await handleDbResponse(
          supabase.rpc("search_campgrounds", {
            q: term || null,
            province_aliases:
              provinceAliases.length > 0 ? provinceAliases : null,
            ...hookupRpcArgs(hookups),
          }),
        );

        if (!result.success) {
          return result;
        }

        const rows = (result.data as CampgroundRow[]).map(toCampgroundDomain);
        return resultSuccess(sortCampgrounds(rows, nonGeoSort));
      }

      const { column, ascending } = CAMPGROUND_SORT_CONFIG[nonGeoSort];

      let query = supabase
        .from("v_campgrounds")
        .select(GUEST_CAMPGROUND_COLUMNS);

      if (term) {
        // Quote values so spaces / apostrophes stay inside one PostgREST filter.
        // Empty-state hint for mismatched province+q is parked as a follow-up.
        const pattern = `"%${term}%"`;
        query = query.or(
          `name.ilike.${pattern},city.ilike.${pattern},province.ilike.${pattern}`,
        );
      }

      query = query.order(column, { ascending });
      if (column !== "name") {
        query = query.order("name", { ascending: true });
      }

      const result = await handleDbResponse(query);

      if (!result.success) {
        return result;
      }

      return resultSuccess(result.data.map(toCampgroundDomain));
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
