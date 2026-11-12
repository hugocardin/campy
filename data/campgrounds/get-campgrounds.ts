import { Campground } from "@/entities/campground";
import {
  CAMPGROUND_SORT_CONFIG,
  CampgroundSort,
  parseCampgroundSort,
  sanitizeCampgroundSearchTerm,
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

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    location,
    website: row.website ?? "",
    phone: row.phone ?? "",
  };
}

/**
 * Follow-up (parked): distinct view/RPC, `unstable_cache` / revalidate, and
 * Quebec/Québec/QC + fr-CA label normalization. Fine at demo scale.
 */
export const getCampgroundProvinces = cache(
  async (): Promise<ActionResult<string[]>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase.from("v_campgrounds").select("province"),
      );

      if (!result.success) {
        return result;
      }

      const provinces = [
        ...new Set(
          result.data
            .map((row) => row.province?.trim())
            .filter((p): p is string => Boolean(p)),
        ),
      ].sort((a, b) => a.localeCompare(b));

      return resultSuccess(provinces);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);

/** Primitives (not an object) so React `cache` can dedupe by argument identity. */
export const getCampgrounds = cache(
  async (
    q?: string,
    sort: CampgroundSort = "name",
    province?: string,
  ): Promise<ActionResult<Campground[]>> => {
    try {
      const supabase = await createClient();
      const resolvedSort = parseCampgroundSort(sort);
      const { column, ascending } = CAMPGROUND_SORT_CONFIG[resolvedSort];
      const term = q ? sanitizeCampgroundSearchTerm(q) : "";
      const provinceFilter = province?.trim().slice(0, 100) || "";

      let query = supabase
        .from("v_campgrounds")
        .select(GUEST_CAMPGROUND_COLUMNS);

      if (term) {
        // Quote values so spaces / apostrophes stay inside one PostgREST filter.
        // Always include province.ilike (harmless with .eq province filter).
        // Empty-state hint for mismatched province+q is parked as a follow-up.
        const pattern = `"%${term}%"`;
        query = query.or(
          `name.ilike.${pattern},city.ilike.${pattern},province.ilike.${pattern}`,
        );
      }

      if (provinceFilter) {
        query = query.eq("province", provinceFilter);
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
