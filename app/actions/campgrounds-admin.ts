"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { routes } from "@/lib/routes";

export async function inactivateCampgroundAction(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("campgrounds")
    .update({ active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to inactivate campground:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(routes.platformAdmin.campgrounds());
  revalidatePath(routes.platformAdmin.campgroundDetails(id));
  // TODO: also revalidate the detail page if you have one
  // revalidatePath(`/campgrounds/${id}`);

  return { success: true };
}

export async function activateCampgroundAction(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("campgrounds")
    .update({ active: true })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to activate campground:", error);
    return { success: false, error: error.message };
  }

  revalidatePath(routes.platformAdmin.campgrounds());
  revalidatePath(routes.platformAdmin.campgroundDetails(id));
  // TODO: also revalidate the detail page if you have one
  // revalidatePath(`/campgrounds/${id}`);

  return { success: true };
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

export async function updateCampgroundAction(input: UpdateCampgroundInput) {
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
    console.error("Update failed:", error);
    return { error: error.message || "Failed to update campground" };
  }

  // Revalidate both list and detail page
  revalidatePath(routes.platformAdmin.campgrounds());
  revalidatePath(routes.platformAdmin.campgroundDetails(input.id));

  return { success: true };
}
