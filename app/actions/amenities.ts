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

export interface AmenityCreateInput {
  code: string;
  category_id: number;
}

export async function createAmenityAction(
  input: AmenityCreateInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("amenities")
        .insert({
          code: input.code.toUpperCase().trim(),
          category_id: input.category_id,
        })
        .select()
        .single(),
    );

    if (result.success) {
      revalidatePath(routes.platformAdmin.amenities());
    }

    return result;
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function deleteAmenityAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const result = await handleDbNoData(
      supabase.from("amenities").delete().eq("id", id),
    );

    if (result.success) {
      revalidatePath(routes.platformAdmin.amenities());
    }

    return result;
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
