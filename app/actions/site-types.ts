"use server";

import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
  SiteTypeMissingField,
} from "@/lib/errors";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import {
  isProtectedSiteTypeCode,
  normalizeSiteTypeCode,
} from "@/lib/site-types/code";
import {
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";

export interface SiteTypeCreateInput {
  code: string;
}

function revalidateSiteTypeConsumers() {
  // Site type create/delete changes pickers and views across platform admin.
  revalidateLocalizedPath(routes.platformAdmin.root(), "layout");
}

export async function createSiteTypeAction(
  input: SiteTypeCreateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const normalized = normalizeSiteTypeCode(input.code);
    if (!normalized.ok) {
      if (normalized.reason === "too_long") {
        return resultError(CommonErrorCode.COMMON_FIELD_TOO_LONG, {
          field: SiteTypeMissingField.code,
        });
      }
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
        field: SiteTypeMissingField.code,
      });
    }

    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("site_types")
        .insert({ code: normalized.code })
        .select("*")
        .single(),
    );

    if (result.success) {
      revalidateSiteTypeConsumers();
    }

    return result;
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function deleteSiteTypeAction(id: string): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, { field: "id" });
    }

    const supabase = await createClient();

    const existing = await handleDbSingle(
      supabase.from("site_types").select("id, code").eq("id", id).single(),
    );
    if (!existing.success) {
      return existing;
    }
    if (isProtectedSiteTypeCode(existing.data.code)) {
      return resultError(DbErrorCode.DB_RESOURCE_IN_USE, {
        reason: "site_type_code_protected",
        field: SiteTypeMissingField.code,
      });
    }

    const { data, error } = await supabase
      .from("site_types")
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

    revalidateSiteTypeConsumers();
    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
