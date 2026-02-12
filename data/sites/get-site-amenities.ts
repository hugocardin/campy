import { ActionResult } from "@/entities/action-result";
import { Amenity } from "@/entities/amenity";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type AmenityWithCategoryRow = {
  amenities: {
    id: string;
    code: string;
    category_id: number;
    amenity_categories: { code: string };
  };
};

function toDomain(row: AmenityWithCategoryRow): Amenity {
  const amenity = row.amenities;

  return {
    id: amenity.id,
    code: amenity.code.trim(),
    category_id: amenity.category_id,
    category_code: amenity.amenity_categories.code,
  };
}

export const getAmenitiesForSite = cache(
  async (sitedId: string): Promise<ActionResult<Amenity[]>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("site_amenities")
        .select(
          `
        amenities!inner (
          id,
          code,
          category_id,
          amenity_categories!left (code)
        )
      `,
        )
        .eq("site_id", sitedId)
        .order("category_id", { referencedTable: "amenities", ascending: true })
        .order("code", { referencedTable: "amenities", ascending: true });

      if (error) {
        return pgerrorToActionResultError(error);
      }

      // @ts-expect-error — types are loose because of the join
      const amenities = data.map(toDomain);

      return {
        success: true,
        data: amenities,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
