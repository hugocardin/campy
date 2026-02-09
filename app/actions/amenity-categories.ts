"use server";

import { ActionResult } from "@/entities/action-result";
import { AmenityCategoryCreateInput } from "@/entities/amenity-categories";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createAmenityCategoryAction(
  input: AmenityCategoryCreateInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("amenity_categories")
      .insert({ code: input.code.toUpperCase().trim() })
      .select("*")
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.amenityCategory());

    return { success: true, data };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}

export async function deleteAmenityCategoryAction(
  id: number,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("amenity_categories")
      .delete()
      .eq("id", id);

    if (error) {
      return pgerrorToActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.amenityCategory());

    return { success: true };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}
