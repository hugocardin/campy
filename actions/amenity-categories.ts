"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { AmenityCategoryCreateInput } from "@/app/entities/amenity-categories";

// Create category
export async function createAmenityCategoryAction(
  input: AmenityCategoryCreateInput,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("amenity_categories")
    .insert({ code: input.code.toUpperCase().trim() })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "No data returned after insert" };
  }

  revalidatePath("/admin/amenity-categories");

  return { success: true, data };
}

// Delete category
export async function deleteAmenityCategoryAction(id: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("amenity_categories")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/amenity-categories");

  return { success: true };
}
