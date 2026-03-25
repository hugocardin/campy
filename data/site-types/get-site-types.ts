import { SiteType } from "@/entities/site-type";
import { ActionResult, resultSuccess } from "@/lib/errors";
import {
  handleDbResponse,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
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

      const result = await handleDbResponse(
        supabase.from("site_types").select("*").order("code"),
      );

      if (!result.success) {
        return result;
      }

      const siteTypes = result.data.map(toDomain);

      return resultSuccess(siteTypes);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
