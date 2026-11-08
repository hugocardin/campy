import { Campground } from "@/entities/campground";
import {
  CAMPGROUND_SORT_CONFIG,
  CampgroundListFilters,
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
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
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

export const getCampgrounds = cache(
  async (
    filters: CampgroundListFilters = {},
  ): Promise<ActionResult<Campground[]>> => {
    try {
      const supabase = await createClient();
      const sort = parseCampgroundSort(filters.sort);
      const { column, ascending } = CAMPGROUND_SORT_CONFIG[sort];
      const q = filters.q ? sanitizeCampgroundSearchTerm(filters.q) : "";
      const province = filters.province?.trim().slice(0, 100) || "";

      let query = supabase.from("v_campgrounds").select("*");

      if (q) {
        // Quote values so spaces in the search term stay inside one PostgREST filter.
        const pattern = `"%${q}%"`;
        query = query.or(
          `name.ilike.${pattern},city.ilike.${pattern},province.ilike.${pattern}`,
        );
      }

      if (province) {
        query = query.eq("province", province);
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
