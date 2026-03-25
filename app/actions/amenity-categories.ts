"use server";

import { ActionResult } from "@/lib/errors";
import { routes } from "@/lib/routes";
import {
  handleDbNoData,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface AmenityCategoryCreateInput {
  code: string;
}

export async function createAmenityCategoryAction(
  input: AmenityCategoryCreateInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("amenity_categories")
        .insert({ code: input.code.toUpperCase().trim() })
        .select("*")
        .single(),
    );

    if (result.success) {
      revalidatePath(routes.platformAdmin.amenityCategory());
    }

    return result;
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function deleteAmenityCategoryAction(
  id: number,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const result = await handleDbNoData(
      supabase.from("amenity_categories").delete().eq("id", id),
    );

    if (result.success) {
      revalidatePath(routes.platformAdmin.amenityCategory());
    }

    return result;
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
