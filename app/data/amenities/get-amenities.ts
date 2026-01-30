import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import { Amenity } from "@/app/entities/amenity";

type AmenityWithCategoryRow = {
  id: string;
  code: string;
  category_id: number;
  amenity_categories: { code: string };
};

function toDomain(row: AmenityWithCategoryRow): Amenity {
  return {
    id: row.id,
    code: row.code.trim(),
    category_id: row.category_id,
    category_code: row.amenity_categories?.code,
  };
}

export const getAllAmenities = cache(async (): Promise<Amenity[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("amenities")
    .select(
      `
      id,
      code,
      category_id,
      amenity_categories!left (code)
    `,
    )
    .order("code");

  if (error) {
    console.error("Failed to load amenities:", error.message);
    throw error;
  }

  // @ts-expect-error — types are loose because of the join; improve later with generated types
  return (data ?? []).map(toDomain);
});
