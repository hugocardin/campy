import { Amenity } from "@/entities/amenity";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
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

      const result = await handleDbResponse(
        supabase
          .from("amenities")
          .select(
            `
        id,
        code,
        category_id,
        amenity_categories!left (code)
      `,
          )
          .order("code"),
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
