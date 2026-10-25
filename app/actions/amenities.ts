"use server";

import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import { routes } from "@/lib/routes";
import {
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface AmenityCreateInput {
  code: string;
  category_id: number;
}

export async function createAmenityAction(
  input: AmenityCreateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!input.code) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: "code",
      });
    }
    if (!input.category_id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: "category",
      });
    }

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
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, { field: "id" });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("amenities")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        return resultError(DbErrorCode.DB_RESOURCE_IN_USE, {
          reason: "amenity_in_use",
          message:
            "This amenity is still linked to a campground or site. Unlink it before deleting.",
        });
      }
      return mapPostgrestError(error);
    }

    if (!data || data.length === 0) {
      return resultError(DbErrorCode.DB_NOT_FOUND, {
        reason: "amenity_not_deleted",
        message:
          "Amenity was not deleted (not found or insufficient permission).",
      });
    }

    revalidatePath(routes.platformAdmin.amenities());
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
