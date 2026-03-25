"use server";

import { CampgroundCreateUpdateInput } from "@/entities/campground_create_update_input";
import { ActionResult, resultError } from "@/lib/errors";
import { CommonErrorCode } from "@/lib/errors/common";
import { routes } from "@/lib/routes";
import {
  handleDbNoData,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function changeCampgroundStatus(id: string, activeFlagToSet: boolean) {
  try {
    const supabase = await createClient();

    const result = await handleDbSingle(
      supabase
        .from("campgrounds")
        .update({ active: activeFlagToSet })
        .eq("id", id)
        .select()
        .single(),
    );

    if (result.success) {
      revalidatePath(routes.platformAdmin.campgrounds());
      revalidatePath(routes.platformAdmin.campgroundView(id));
      revalidatePath(routes.platformAdmin.campgroundEdit(id));
    }

    return result;
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
  try {
    if (!input.id) {
      return resultError(CommonErrorCode.MISSING_ID);
    }

    const supabase = await createClient();

    // Build the geography point in WKT format (Well-Known Text)
    // Format: POINT(longitude latitude)
    // SRID 4326 = WGS 84 (standard for GPS coordinates)
    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;

    const result = await handleDbNoData(
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
          website: input.website || null,
          phone: input.phone || null,
          updated_at: new Date().toISOString(),

          // This is the important part: convert to geography type
          location: `SRID=4326;${locationWKT}`,
        })
        .eq("id", input.id),
    );

    if (result.success) {
      // Revalidate both list and detail page
      revalidatePath(routes.platformAdmin.campgrounds());
      revalidatePath(routes.platformAdmin.campgroundView(input.id));
      revalidatePath(routes.platformAdmin.campgroundEdit(input.id));
    }
  } catch (err) {
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundView(input.id)); // TODO redirect should be done from the client side.
}

export async function createCampgroundAction(
  input: CampgroundCreateUpdateInput,
): Promise<ActionResult> {
  let newCampgroundId;

  try {
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
          website: input.website?.trim() || null,
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

    revalidatePath(routes.platformAdmin.campgrounds());
  } catch (err) {
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundView(newCampgroundId));
}

export async function updateCampgroundAmenitiesAction({
  campgroundId,
  amenityIds,
}: {
  campgroundId: string;
  amenityIds: string[];
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // 1. Delete all existing links for this campground
    const resultDelete = await handleDbNoData(
      supabase
        .from("campground_amenities")
        .delete()
        .eq("campground_id", campgroundId),
    );

    if (!resultDelete.success) {
      return resultDelete;
    }

    // 2. If there are new amenities to add → insert them
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        campground_id: campgroundId,
        amenity_id,
      }));

      const resultInsert = await handleDbNoData(
        supabase.from("campground_amenities").insert(inserts),
      );

      if (!resultInsert.success) {
        return resultInsert;
      }
    }

    revalidatePath(routes.platformAdmin.campgrounds());
    revalidatePath(routes.platformAdmin.campgroundView(campgroundId));
    revalidatePath(routes.platformAdmin.campgroundEdit(campgroundId));
    revalidatePath(routes.platformAdmin.campgroundAmenities(campgroundId));
  } catch (err) {
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundView(campgroundId));
}
