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

type CampgroundRow = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  website: string | null;
  phone: string | null;
};

export function toCampgroundDomain(row: CampgroundRow): Campground {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    location: {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    },
    website: row.website ?? "",
    phone: row.phone ?? "",
  };
}

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

      let query = supabase.from("v_campgrounds").select("*");

      if (term) {
        // Quote values so spaces / apostrophes stay inside one PostgREST filter.
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
