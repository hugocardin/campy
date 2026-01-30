import { AmenityCategory } from "@/app/entities/amenity-categories";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type AmenityCategoryRow = {
  id: number;
  code: string;
};

function toDomain(row: AmenityCategoryRow): AmenityCategory {
  return {
    id: row.id,
    code: row.code.trim(),
  };
}

export const getAllAmenityCategories = cache(
  async (): Promise<AmenityCategory[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("amenity_categories")
      .select("*")
      .order("code");

    if (error) {
      console.error("Failed to load amenity categories:", error);
      throw error;
    }

    return (data ?? []).map(toDomain);
  },
);
