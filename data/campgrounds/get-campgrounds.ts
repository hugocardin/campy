import { Campground } from "@/entities/campground";
import { ActionResult } from "@/entities/action-result";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

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

function toDomain(row: CampgroundRow): Campground {
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

export const getCampgrounds = cache(
  async (): Promise<ActionResult<Campground[]>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("v_campgrounds")
        .select("*")
        .order("name");

      if (error) {
        return pgerrorToActionResultError(error);
      }

      const campgrounds = data.map(toDomain);

      return {
        success: true,
        data: campgrounds,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
