import { Amenity } from "@/entities/amenity";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
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

      const result = await handleDbResponse(
        supabase
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
          .order("category_id", {
            referencedTable: "amenities",
            ascending: true,
          })
          .order("code", { referencedTable: "amenities", ascending: true }),
      );

      if (!result.success) {
        return result;
      }

      // @ts-expect-error — types are loose because of the join
      const amenities = result.data.map(toDomain);

      return resultSuccess(amenities);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
