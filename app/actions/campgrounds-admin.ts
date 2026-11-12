"use server";

import { CampgroundCreateUpdateInput } from "@/entities/campground_create_update_input";
import { redirect } from "@/i18n/navigation";
import { ActionResult, DbErrorCode, resultError } from "@/lib/errors";
import { CommonErrorCode } from "@/lib/errors/common";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { toSafeHttpUrl } from "@/lib/safe-http-url";
import {
  handleDbNoData,
  handleDbResponse,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { requirePlatformAdmin } from "@/lib/supabase/require-platform-admin";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";

function normalizeWebsiteInput(
  website: string | null | undefined,
): ActionResult<string | null> {
  const trimmed = website?.trim() ?? "";
  if (!trimmed) {
    return { success: true, data: null };
  }
  // Safety check only — persist the trimmed original (not url.toString()).
  if (!toSafeHttpUrl(trimmed)) {
    return resultError(CommonErrorCode.COMMON_INVALID_FIELD, {
      field: "campground.website",
    });
  }
  return { success: true, data: trimmed };
}

function revalidateCampgroundPublicAndAdmin(id: string) {
  revalidateLocalizedPath(routes.home());
  revalidateLocalizedPath(routes.campgroundDetail(id));
  revalidateLocalizedPath(routes.platformAdmin.root());
  revalidateLocalizedPath(routes.platformAdmin.campgrounds());
  revalidateLocalizedPath(routes.platformAdmin.campgroundView(id));
  revalidateLocalizedPath(routes.platformAdmin.campgroundEdit(id));
}

async function changeCampgroundStatus(
  id: string,
  activeFlagToSet: boolean,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createClient();

    // Explicit columns only — bare `.select()` is `select=*`, which needs
    // commission_* and fails after authenticated lost table-level SELECT.
    const result = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({ active: activeFlagToSet })
        .eq("id", id)
        .select("id, active")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    revalidateCampgroundPublicAndAdmin(id);
    return { success: true, data: undefined };
  } catch (err) {
    return handleUnexpectedError(err);
  }
}

export async function inactivateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  return changeCampgroundStatus(id, false);
}

export async function activateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  return changeCampgroundStatus(id, true);
}

export async function updateCampgroundAction(
  input: CampgroundCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    if (!input.id) {
      return resultError(CommonErrorCode.COMMON_MISSING_FIELD, { field: "id" });
    }

    const websiteResult = normalizeWebsiteInput(input.website);
    if (!websiteResult.success) {
      return websiteResult;
    }

    const supabase = await createClient();

    // Build the geography point in WKT format (Well-Known Text)
    // Format: POINT(longitude latitude)
    // SRID 4326 = WGS 84 (standard for GPS coordinates)
    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;

    // .select().single() so RLS-filtered 0-row updates surface as errors
    // instead of handleDbNoData fake-success + redirect.
    const result = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({
          name: input.name,
          owner_id: input.owner_id,
          description: input.description || null,
          address: input.address || null,
          city: input.city || null,
          province: input.province || null,
          country: input.country || null,
          website: websiteResult.data,
          phone: input.phone || null,
          updated_at: new Date().toISOString(),

          // This is the important part: convert to geography type
          location: `SRID=4326;${locationWKT}`,
        })
        .eq("id", input.id)
        .select("id")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    revalidateCampgroundPublicAndAdmin(input.id);
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(input.id),
    locale,
  });
}

export async function createCampgroundAction(
  input: CampgroundCreateUpdateInput,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  let newCampgroundId;

  try {
    const websiteResult = normalizeWebsiteInput(input.website);
    if (!websiteResult.success) {
      return websiteResult;
    }

    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("campgrounds")
        .insert({
          name: input.name.trim(),
          owner_id: input.owner_id,
          description: input.description?.trim() || null,
          address: input.address?.trim() || null,
          city: input.city?.trim() || null,
          province: input.province?.trim() || null,
          country: input.country?.trim() || null,
          website: websiteResult.data,
          phone: input.phone?.trim() || null,
          location: `SRID=4326;${locationWKT}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );

    if (!result.success) {
      return result;
    }

    newCampgroundId = result.data.id;

    revalidateLocalizedPath(routes.home());
    revalidateLocalizedPath(routes.campgroundDetail(newCampgroundId));
    revalidateLocalizedPath(routes.platformAdmin.root());
    revalidateLocalizedPath(routes.platformAdmin.campgrounds());
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(newCampgroundId),
    locale,
  });
}

export async function updateCampgroundAmenitiesAction({
  campgroundId,
  amenityIds,
}: {
  campgroundId: string;
  amenityIds: string[];
}): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createClient();

    // 1. Delete existing links. 0 rows is OK (empty → empty, or first assign).
    //    A hard RLS/error still fails via handleDbNoData.
    const resultDelete = await handleDbNoData(
      supabase
        .from("campground_amenities")
        .delete()
        .eq("campground_id", campgroundId),
    );

    if (!resultDelete.success) {
      return resultDelete;
    }

    // 2. Insert new links with .select() so an RLS-blocked insert cannot
    //    report success after a quiet delete (empty amenity lists are valid).
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        campground_id: campgroundId,
        amenity_id,
      }));

      const resultInsert = await handleDbResponse(
        supabase.from("campground_amenities").insert(inserts).select("amenity_id"),
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

    revalidateCampgroundPublicAndAdmin(campgroundId);
    revalidateLocalizedPath(
      routes.platformAdmin.campgroundAmenities(campgroundId),
    );
  } catch (err) {
    return handleUnexpectedError(err);
  }

  const locale = await getLocale();
  return redirect({
    href: routes.platformAdmin.campgroundView(campgroundId),
    locale,
  });
}
