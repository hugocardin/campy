import {
  AmenityCategory,
  AmenityCategoryCreateInput,
} from "@/entities/amenity-categories";
import { getSupabaseClient } from "@/lib/supabase/server";
import { cache } from "react";

type AmenityCategoryRow = {
  id: number;
  name: string;
};

function toDomain(row: AmenityCategoryRow): AmenityCategory {
  return {
    id: row.id,
    name: row.name.trim(),
  };
}

export const getAllAmenityCategories = cache(
  async (): Promise<AmenityCategory[]> => {
    const { data, error } = await getSupabaseClient()
      .from("amenity_categories")
      .select("*")
      .order("name");

    if (error) {
      console.error("Failed to load amenity categories:", error);
      throw error;
    }

    return (data ?? []).map(toDomain);
  },
);

export async function createAmenityCategory(
  input: AmenityCategoryCreateInput,
): Promise<AmenityCategory> {
  const { data, error } = await getSupabaseClient()
    .from("amenity_categories")
    .insert({ name: input.name.trim() })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("No data returned after insert");

  return toDomain(data);
}

export async function deleteAmenityCategory(id: number): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("amenity_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
