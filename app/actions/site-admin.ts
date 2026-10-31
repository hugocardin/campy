"use server";

import { SiteCreateUpdateInput } from "@/entities/site_create_update_input";
import { redirect } from "@/i18n/navigation";
import {
  ActionResult,
  CommonErrorCode,
  DbErrorCode,
  resultError,
} from "@/lib/errors";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import {
  handleDbNoData,
  handleDbResponse,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";

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

  try {
    const supabase = await createClient();

    // .select().single() so RLS-filtered 0-row updates surface as errors
    // instead of handleDbNoData fake-success + redirect.
    const result = await handleDbSingle(
      supabase
        .from("sites")
        .update({
          name: input.name,
          site_type_id: input.site_type_id,
          max_rig_length: input.max_rig_length,
          price_per_night_base: input.price_per_night,
          min_stay_nights: input.min_stay_nights,
          description: input.description,
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

  let newSiteId;
  try {
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("sites")
        .insert({
          campground_id: campgroundId,
          name: input.name,
          site_type_id: input.site_type_id,
          max_rig_length: input.max_rig_length ?? null,
          price_per_night_base: input.price_per_night,
          min_stay_nights: input.min_stay_nights,
          description: input.description,
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
