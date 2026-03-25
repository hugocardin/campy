import { AmenityCategory } from "@/entities/amenity-categories";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type AmenityCategoryRow = {
  id: number;
  code: string;
};

function toDomain(row: AmenityCategoryRow): AmenityCategory {
  return {
    id: row.id,
    code: row.code.trim(),
  };
}

export const getAllAmenityCategories = cache(
  async (): Promise<ActionResult<AmenityCategory[]>> => {
    try {
      const supabase = await createClient();
      const result = await handleDbResponse(
        supabase.from("amenity_categories").select("*").order("code"),
      );

      if (!result.success) {
        return result;
      }

      const amenityCategories = result.data.map(toDomain);

      return resultSuccess(amenityCategories);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
