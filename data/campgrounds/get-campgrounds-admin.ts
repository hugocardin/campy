import { CampgroundAdmin } from "@/entities/campground-admin";
import { ActionResult } from "@/entities/action-result";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type CampgroundAdminRow = {
  id: string;
  owner_id: string;
  owner_full_name: string;
  owner_email: string;
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
  active: boolean;
};

function toDomain(row: CampgroundAdminRow): CampgroundAdmin {
  return {
    id: row.id,
    owner_id: row.owner_id,
    owner_full_name: row.owner_full_name,
    owner_email: row.owner_email,
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
    active: row.active,
  };
}

export const getCampgroundsAdmin = cache(
  async (): Promise<ActionResult<CampgroundAdmin[]>> => {
    try {
      const supabase = await createClient();

      const query = supabase
        .from("v_campgrounds_admin")
        .select("*")
        .order("name");

      const { data, error } = await query;

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

export const getCampgroundAdminById = cache(
  async (id: string): Promise<ActionResult<CampgroundAdmin>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("v_campgrounds_admin")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return pgerrorToActionResultError(error);
      }
      const campground = toDomain(data);

      return {
        success: true,
        data: campground,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
