"use server";

import { ActionResult } from "@/entities/action-result";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface AmenityCreateInput {
  code: string;
  category_id: number;
}

export async function createAmenityAction(
  input: AmenityCreateInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("amenities")
      .insert({
        code: input.code.toUpperCase().trim(),
        category_id: input.category_id,
      })
      .select("*")
      .single();

    if (error) {
      return unhandledErrortoActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.amenities());

    return { success: true, data };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}

export async function deleteAmenityAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("amenities").delete().eq("id", id);

    if (error) {
      return unhandledErrortoActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.amenities());

    return { success: true };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}
