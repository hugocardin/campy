"use server";

import { ActionResult } from "@/entities/action-result";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function inactivateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("campgrounds")
      .update({ active: false })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.campgrounds());
    revalidatePath(routes.platformAdmin.campgroundView(id));
    revalidatePath(routes.platformAdmin.campgroundEdit(id));

    return { success: true };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}

export async function activateCampgroundAction(
  id: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("campgrounds")
      .update({ active: true })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.campgrounds());
    revalidatePath(routes.platformAdmin.campgroundView(id));
    revalidatePath(routes.platformAdmin.campgroundEdit(id));

    return { success: true };
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }
}

type UpdateCampgroundInput = {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  website: string;
  phone: string;
  location: {
    lat: number;
    lng: number;
  };
};

export async function updateCampgroundAction(
  input: UpdateCampgroundInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Build the geography point in WKT format (Well-Known Text)
    // Format: POINT(longitude latitude)
    // SRID 4326 = WGS 84 (standard for GPS coordinates)
    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;

    const { error } = await supabase
      .from("campgrounds")
      .update({
        name: input.name,
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
      .eq("id", input.id);

    if (error) {
      return pgerrorToActionResultError(error);
    }

    // Revalidate both list and detail page
    revalidatePath(routes.platformAdmin.campgrounds());
    revalidatePath(routes.platformAdmin.campgroundView(input.id));
    revalidatePath(routes.platformAdmin.campgroundEdit(input.id));
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundView(input.id));

  return { success: true };
}

type CreateCampgroundInput = {
  name: string;
  owner_id: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  website?: string;
  phone?: string;
  location: {
    lat: number;
    lng: number;
  };
};

export async function createCampgroundAction(
  input: CreateCampgroundInput,
): Promise<ActionResult> {
  let newId: string;

  try {
    const locationWKT = `POINT(${input.location.lng} ${input.location.lat})`;
    const supabase = await createClient();

    const { data, error } = await supabase
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
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    newId = data.id;

    revalidatePath(routes.platformAdmin.campgrounds());
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundView(newId));

  return {
    success: true,
    data: newId,
  };
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
    const { error: deleteError } = await supabase
      .from("campground_amenities")
      .delete()
      .eq("campground_id", campgroundId);

    if (deleteError) {
      return pgerrorToActionResultError(deleteError);
    }

    // 2. If there are new amenities to add → insert them
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        campground_id: campgroundId,
        amenity_id,
      }));

      const { error: insertError } = await supabase
        .from("campground_amenities")
        .insert(inserts);

      if (insertError) {
        return pgerrorToActionResultError(insertError);
      }
    }

    revalidatePath(routes.platformAdmin.campgrounds());
    revalidatePath(routes.platformAdmin.campgroundView(campgroundId));
    revalidatePath(routes.platformAdmin.campgroundEdit(campgroundId));
    revalidatePath(routes.platformAdmin.campgroundAmenities(campgroundId));
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundView(campgroundId));
  return { success: true };
}
