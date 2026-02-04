import { Campground } from "@/app/entities/campground";
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

export const getCampgrounds = cache(async (): Promise<Campground[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_campgrounds")
    .select("*")
    .order("name");

  if (error) {
    console.error("Failed to load campgrounds:", error);
    throw error;
  }

  return (data ?? []).map(toDomain);
});
