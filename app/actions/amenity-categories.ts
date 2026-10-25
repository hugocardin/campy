"use server";

import {
  ActionResult,
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

export interface AmenityCategoryCreateInput {
  code: string;
}

export async function createAmenityCategoryAction(
  input: AmenityCategoryCreateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

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
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!id) {
      return resultError(DbErrorCode.DB_NOT_FOUND, { reason: "missing_id" });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("amenity_categories")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        return resultError(DbErrorCode.DB_RESOURCE_IN_USE, {
          reason: "resource_in_use",
        });
      }
      return mapPostgrestError(error);
    }

    if (!data || data.length === 0) {
      return resultError(DbErrorCode.DB_NOT_FOUND, {
        reason: "not_deleted",
      });
    }

    revalidatePath(routes.platformAdmin.amenityCategory());
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
