import { ActionResult } from "@/entities/action-result";
import { SiteType } from "@/entities/site-type";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type SiteTypeWithCategoryRow = {
  id: string;
  code: string;
};

function toDomain(row: SiteTypeWithCategoryRow): SiteType {
  return {
    id: row.id,
    code: row.code.trim(),
  };
}
export const getAllSiteTypes = cache(
  async (): Promise<ActionResult<SiteType[]>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("site_types")
        .select("*")
        .order("code");

      if (error) {
        return pgerrorToActionResultError(error);
      }

      const siteTypes = data.map(toDomain);

      return {
        success: true,
        data: siteTypes,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
