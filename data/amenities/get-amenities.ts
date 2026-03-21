import { ActionResult, resultSuccess } from "@/entities/action-result";
import { Amenity } from "@/entities/amenity";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type AmenityWithCategoryRow = {
  id: string;
  code: string;
  category_id: number;
  amenity_categories: { code: string };
};

function toDomain(row: AmenityWithCategoryRow): Amenity {
  return {
    id: row.id,
    code: row.code.trim(),
    category_id: row.category_id,
    category_code: row.amenity_categories?.code,
  };
}
export const getAllAmenities = cache(
  async (): Promise<ActionResult<Amenity[]>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("amenities")
        .select(
          `
        id,
        code,
        category_id,
        amenity_categories!left (code)
      `,
        )
        .order("code");

      if (error) {
        return pgerrorToActionResultError(error);
      }

      // @ts-expect-error — types are loose because of the join
      const amenities = data.map(toDomain);

      return resultSuccess(amenities);
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
