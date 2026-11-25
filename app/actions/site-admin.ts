"use server";

import { SiteCreateUpdateInput } from "@/entities/site_create_update_input";
import { redirect } from "@/i18n/navigation";
import {
  type DrivewayType,
  parseDrivewayTypeInput,
} from "@/lib/driveway-type";
import { parseElectricityAmpsInput } from "@/lib/electricity-amps";
import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
  resultSuccess,
} from "@/lib/errors";
import { isUuid } from "@/lib/is-uuid";
import { sitePhotoPathPrefix } from "@/lib/park-media";
import { removeParkMediaByPrefix } from "@/lib/park-media-storage";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import {
  isLodgingSiteType,
  normalizeStoredRigLengthFeet,
  siteTypeRequiresMaxRigLength,
} from "@/lib/site-rig-length";
import {
  handleDbNoData,
  handleDbResponse,
  handleDbSingle,
  handleUnexpectedError,
  mapPostgrestError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function revalidateSitePages(campgroundId: string, siteId: string) {
  revalidateLocalizedPath(routes.platformAdmin.campgroundSites(campgroundId));
  revalidateLocalizedPath(
    routes.platformAdmin.campgroundSiteView(campgroundId, siteId),
  );
  revalidateLocalizedPath(
    routes.platformAdmin.campgroundSiteEdit(campgroundId, siteId),
  );
  revalidateLocalizedPath(routes.platformAdmin.campgroundView(campgroundId));
  revalidateLocalizedPath(routes.platformAdmin.campgroundEdit(campgroundId));
  revalidateLocalizedPath(routes.campgroundDetail(campgroundId));
}

async function resolveSiteTypeCode(
  supabase: SupabaseClient,
  siteTypeId: number,
): Promise<ActionResult<string>> {
  const result = await handleDbSingle(
    supabase
      .from("site_types")
      .select("code")
      .eq("id", siteTypeId)
      .single(),
  );
  if (!result.success) {
    return result;
  }
  return { success: true, data: String(result.data.code) };
}

/** Apply lodging/RV max_rig + driveway rules before write (issue #27). */
function normalizeSiteWriteFields(
  siteTypeCode: string,
  maxRigLength: number | undefined,
  drivewayType: DrivewayType | null,
):
  | {
      ok: true;
      max_rig_length: number | null;
      driveway_type: DrivewayType | null;
    }
  | { ok: false; error: ActionResult } {
  if (isLodgingSiteType(siteTypeCode)) {
    return { ok: true, max_rig_length: null, driveway_type: null };
  }

  let normalizedMaxRig: number | null = null;
  if (maxRigLength != null) {
    const parsed = normalizeStoredRigLengthFeet(maxRigLength);
    if (!parsed.ok) {
      return {
        ok: false,
        error: resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
          field: "max_rig_length",
        }),
      };
    }
    normalizedMaxRig = parsed.feet;
  }

  if (siteTypeRequiresMaxRigLength(siteTypeCode)) {
    if (normalizedMaxRig == null) {
      return {
        ok: false,
        error: resultError(CommonErrorCode.COMMON_MISSING_FIELD, {
          field: "max_rig_length",
        }),
      };
    }
  }
  return {
    ok: true,
    max_rig_length: normalizedMaxRig,
    driveway_type: drivewayType,
  };
}

export async function updateSiteAction(
  campgroundId: string,
  input: SiteCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  if (!input.id) {
    return resultError(CommonErrorCode.COMMON_MISSING_FIELD, { field: "id" });
  }

  const ampsParsed = parseElectricityAmpsInput(input.electricity_amps);
  if (!ampsParsed.ok) {
    return resultError(
      ampsParsed.reason === "missing"
        ? CommonErrorCode.COMMON_MISSING_FIELD
        : CommonErrorCode.COMMON_INVALID_FIELD,
      { field: "electricity_amps" },
    );
  }

  const drivewayParsed = parseDrivewayTypeInput(input.driveway_type);
  if (!drivewayParsed.ok) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "driveway_type",
    });
  }

  try {
    const supabase = await createClient();

    const typeResult = await resolveSiteTypeCode(supabase, input.site_type_id);
    if (!typeResult.success) {
      return typeResult;
    }
    const normalized = normalizeSiteWriteFields(
      typeResult.data,
      input.max_rig_length,
      drivewayParsed.drivewayType,
    );
    if (!normalized.ok) {
      return normalized.error;
    }

    // .select().single() so RLS-filtered 0-row updates surface as errors
    // instead of handleDbNoData fake-success + redirect.
    const result = await handleDbSingle(
      supabase
        .from("sites")
        .update({
          name: input.name,
          site_type_id: input.site_type_id,
          max_rig_length: normalized.max_rig_length,
          price_per_night_base: input.price_per_night,
          min_stay_nights: input.min_stay_nights,
          description: input.description,
          electricity_amps: ampsParsed.amps,
          driveway_type: normalized.driveway_type,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select("id")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    revalidateSitePages(campgroundId, input.id);
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundSiteView(campgroundId, input.id),
    locale,
  });
}

export async function createSiteAction(
  campgroundId: string,
  input: SiteCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  const ampsParsed = parseElectricityAmpsInput(input.electricity_amps);
  if (!ampsParsed.ok) {
    return resultError(
      ampsParsed.reason === "missing"
        ? CommonErrorCode.COMMON_MISSING_FIELD
        : CommonErrorCode.COMMON_INVALID_FIELD,
      { field: "electricity_amps" },
    );
  }

  const drivewayParsed = parseDrivewayTypeInput(input.driveway_type);
  if (!drivewayParsed.ok) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "driveway_type",
    });
  }

  let newSiteId;
  try {
    const supabase = await createClient();

    const typeResult = await resolveSiteTypeCode(supabase, input.site_type_id);
    if (!typeResult.success) {
      return typeResult;
    }
    const normalized = normalizeSiteWriteFields(
      typeResult.data,
      input.max_rig_length,
      drivewayParsed.drivewayType,
    );
    if (!normalized.ok) {
      return normalized.error;
    }

    const result = await handleDbSingle(
      supabase
        .from("sites")
        .insert({
          campground_id: campgroundId,
          name: input.name,
          site_type_id: input.site_type_id,
          max_rig_length: normalized.max_rig_length,
          price_per_night_base: input.price_per_night,
          min_stay_nights: input.min_stay_nights,
          description: input.description,
          electricity_amps: ampsParsed.amps,
          driveway_type: normalized.driveway_type,
        })

        .select("id")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    newSiteId = result.data.id;

    revalidateLocalizedPath(routes.platformAdmin.campgroundSites(campgroundId));
    revalidateLocalizedPath(routes.platformAdmin.campgroundView(campgroundId));
    revalidateLocalizedPath(routes.campgroundDetail(campgroundId));
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundSiteView(campgroundId, newSiteId),
    locale,
  });
}

/**
 * Hard-delete a site. Storage under `{campgroundId}/sites/{siteId}/` is
 * cleaned best-effort after the row delete (failures are logged only — #57).
 * Bookings FK is ON DELETE RESTRICT → DB_RESOURCE_IN_USE when booked.
 */
export async function deleteSiteAction(
  campgroundId: string,
  siteId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  if (!isUuid(campgroundId) || !isUuid(siteId)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: !isUuid(campgroundId) ? "campgroundId" : "siteId",
    });
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("sites")
      .delete()
      .eq("id", siteId)
      .eq("campground_id", campgroundId)
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

    // Row gone — Storage cleanup must not fail the action.
    try {
      await removeParkMediaByPrefix(
        supabase,
        sitePhotoPathPrefix(campgroundId, siteId),
      );
    } catch (err) {
      console.warn("[park-media] site delete storage cleanup threw", err);
    }

    revalidateLocalizedPath(routes.platformAdmin.campgroundSites(campgroundId));
    revalidateLocalizedPath(routes.platformAdmin.campgroundView(campgroundId));
    revalidateLocalizedPath(routes.campgroundDetail(campgroundId));
    revalidateLocalizedPath(routes.home());

    return resultSuccess();
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function updateSiteAmenitiesAction({
  campgroundId,
  siteId,
  amenityIds,
}: {
  campgroundId: string;
  siteId: string;
  amenityIds: string[];
}): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createClient();

    // 1. Delete existing links. 0 rows is OK (empty list is valid).
    const resultDelete = await handleDbNoData(
      supabase.from("site_amenities").delete().eq("site_id", siteId),
    );

    if (!resultDelete.success) {
      return resultDelete;
    }

    // 2. Insert with .select() so RLS cannot silently accept a partial write.
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        site_id: siteId,
        amenity_id,
      }));

      const resultInsert = await handleDbResponse(
        supabase.from("site_amenities").insert(inserts).select("amenity_id"),
      );

      if (!resultInsert.success) {
        return resultInsert;
      }

      if (resultInsert.data.length !== amenityIds.length) {
        return resultError(DbErrorCode.DB_PERMISSION_DENIED, {
          reason: "amenity_insert_incomplete",
        });
      }
    }

    revalidateSitePages(campgroundId, siteId);
    revalidateLocalizedPath(
      routes.platformAdmin.campgroundSiteAmenities(campgroundId, siteId),
    );
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundSiteView(campgroundId, siteId),
    locale,
  });
}
