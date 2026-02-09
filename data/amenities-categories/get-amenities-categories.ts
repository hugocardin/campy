import { ActionResult } from "@/entities/action-result";
import { AmenityCategory } from "@/entities/amenity-categories";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
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
      const { data, error } = await supabase
        .from("amenity_categories")
        .select("*")
        .order("code");

      if (error) {
        return pgerrorToActionResultError(error);
      }

      const amenityCategories = data.map(toDomain);

      return {
        success: true,
        data: amenityCategories,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
