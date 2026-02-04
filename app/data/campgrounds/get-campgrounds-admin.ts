import { CampgroundAdmin } from "@/app/entities/campground-admin";
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
  async (): Promise<CampgroundAdmin[]> => {
    const supabase = await createClient();

    const query = supabase
      .from("v_campgrounds_admin")
      .select("*")
      .order("name");

    const { data, error } = await query;

    if (error) {
      console.error("Failed to load campgrounds:", error);
      throw error;
    }

    return (data ?? []).map(toDomain);
  },
);

export const getCampgroundAdminById = cache(
  async (id: string): Promise<CampgroundAdmin | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("v_campgrounds_admin")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(`Failed to load campground ${id}:`, error);
      throw error;
    }

    if (!data) {
      return null;
    }

    return toDomain(data);
  },
);
