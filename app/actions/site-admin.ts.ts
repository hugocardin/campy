"use server";

import { ActionResult } from "@/entities/action-result";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type UpdateSiteInput = {
  id: string;
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: string;
  price_per_night: string;
  min_stay_nights: string;
};

export async function updateSiteAction(
  campgroundId: string,
  input: UpdateSiteInput,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
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
      .eq("id", input.id);

    if (error) {
      return pgerrorToActionResultError(error);
    }

    revalidatePath(routes.platformAdmin.campgroundSites(campgroundId));
    revalidatePath(
      routes.platformAdmin.campgroundSiteView(campgroundId, input.id),
    );
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, input.id));

  return { success: true };
}

type CreateSiteInput = {
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: number | null;
  price_per_night: number;
  min_stay_nights: number;
};

export async function createSiteAction(
  campgroundId: string,
  input: CreateSiteInput,
): Promise<ActionResult> {
  let newId: string;

  try {
    const supabase = await createClient();

    console.log(`max_rig_length is ${input.max_rig_length}`);

    const { data, error } = await supabase
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
      .single();

    if (error) {
      return pgerrorToActionResultError(error);
    }

    newId = data.id;

    revalidatePath(routes.platformAdmin.campgroundSites(campgroundId));
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, newId));

  return { success: true };
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
  try {
    const supabase = await createClient();

    // 1. Delete all existing links for this campground
    const { error: deleteError } = await supabase
      .from("site_amenities")
      .delete()
      .eq("site_id", siteId);

    if (deleteError) {
      return pgerrorToActionResultError(deleteError);
    }

    // 2. If there are new amenities to add → insert them
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        site_id: siteId,
        amenity_id,
      }));

      const { error: insertError } = await supabase
        .from("site_amenities")
        .insert(inserts);

      if (insertError) {
        return pgerrorToActionResultError(insertError);
      }
    }

    revalidatePath(routes.platformAdmin.campgroundSites(campgroundId));
    revalidatePath(
      routes.platformAdmin.campgroundSiteView(campgroundId, siteId),
    );
    revalidatePath(
      routes.platformAdmin.campgroundSiteEdit(campgroundId, siteId),
    );
  } catch (err) {
    return unhandledErrortoActionResultError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, siteId));
  return { success: true };
}
