"use server";

import { SiteCreateUpdateInput } from "@/entities/site_create_update_input";
import { ActionResult, CommonErrorCode, resultError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import {
  handleDbNoData,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function updateSiteAction(
  campgroundId: string,
  input: SiteCreateUpdateInput,
): Promise<ActionResult> {
  if (!input.id) {
    return resultError(CommonErrorCode.MISSING_ID);
  }

  try {
    const supabase = await createClient();

    const result = await handleDbNoData(
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
        .eq("id", input.id),
    );

    if (!result.success) {
      return result;
    }

    revalidatePath(routes.platformAdmin.campgroundSites(campgroundId));
    revalidatePath(
      routes.platformAdmin.campgroundSiteView(campgroundId, input.id),
    );
  } catch (err) {
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, input.id));
}

export async function createSiteAction(
  campgroundId: string,
  input: SiteCreateUpdateInput,
): Promise<ActionResult> {
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

    revalidatePath(routes.platformAdmin.campgroundSites(campgroundId));
  } catch (err) {
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, newSiteId));
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
    const resultDelete = await handleDbNoData(
      supabase.from("site_amenities").delete().eq("site_id", siteId),
    );

    if (!resultDelete.success) {
      return resultDelete;
    }

    // 2. If there are new amenities to add → insert them
    if (amenityIds.length > 0) {
      const inserts = amenityIds.map((amenity_id) => ({
        site_id: siteId,
        amenity_id,
      }));

      const resultInsert = await handleDbNoData(
        supabase.from("site_amenities").insert(inserts),
      );

      if (!resultInsert.success) {
        return resultInsert;
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
    return handleUnexpectedError(err);
  }

  redirect(routes.platformAdmin.campgroundSiteView(campgroundId, siteId));
}
