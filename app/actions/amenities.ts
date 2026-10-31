"use server";

import {
  ActionResult,
  AmenityMissingField,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import {
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";

export interface AmenityCreateInput {
  code: string;
  category_id: number;
}

function revalidateAmenityConsumers() {
  // Amenity create/delete changes pickers and views across platform admin.
  revalidateLocalizedPath(routes.platformAdmin.root(), "layout");
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
        field: AmenityMissingField.code,
      });
    }
    if (!input.category_id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: AmenityMissingField.category,
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
      revalidateAmenityConsumers();
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

    revalidateAmenityConsumers();
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
