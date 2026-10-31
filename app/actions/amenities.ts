"use server";

import {
  ActionResult,
  AmenityMissingField,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import { normalizeAmenityCode } from "@/lib/amenities/code";
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
    // Normalize before missing/too-long checks so whitespace-only / non-string
    // payloads cannot bypass the server guard (client trim is not enough).
    // DB CHECK (length(trim(code)) > 0) still tracked as a follow-up — no
    // in-repo migrations yet.
    const normalized = normalizeAmenityCode(input.code);
    if (!normalized.ok) {
      if (normalized.reason === "too_long") {
        return resultError(CommonErrorCode.COMMON_FIELD_TOO_LONG, {
          field: AmenityMissingField.code,
        });
      }
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: AmenityMissingField.code,
      });
    }
    if (
      !Number.isSafeInteger(input.category_id) ||
      input.category_id <= 0
    ) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: AmenityMissingField.category,
      });
    }

    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("amenities")
        .insert({
          code: normalized.code,
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
