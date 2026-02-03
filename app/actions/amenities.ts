"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { AmenityCreateInput } from "@/entities/amenity";
import { routes } from "@/lib/routes";

export async function createAmenityAction(input: AmenityCreateInput) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("amenities")
    .insert({
      code: input.code.toUpperCase().trim(),
      category_id: input.category_id,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  if (!data) return { error: "No data returned after insert" };

  revalidatePath(routes.platformAdmin.amenities());

  return { success: true, data };
}

export async function deleteAmenityAction(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("amenities").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(routes.platformAdmin.amenities());

  return { success: true };
}
