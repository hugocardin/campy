import { ActionResult } from "@/entities/action-result";
import { Site } from "@/entities/sites";
import { pgerrorToActionResultError } from "@/lib/errors/supabase-errors";
import { unhandledErrortoActionResultError } from "@/lib/errors/unhanded-errors";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type SiteWithSiteTypeRow = {
  id: string;
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: number | null;
  price_per_night_base: number;
  min_stay_nights: number;
  site_types: { code: string };
};

function toDomain(row: SiteWithSiteTypeRow): Site {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    site_type_id: row.site_type_id,
    site_type_code: row.site_types.code,
    max_rig_length: row.max_rig_length,
    price_per_night: row.price_per_night_base,
    min_stay_nights: row.min_stay_nights,
  };
}

export const getSitesOfCampground = cache(
  async (campgroundId: string): Promise<ActionResult<Site[]>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("sites")
        .select(
          ` id,
            name,
            site_type_id,
            max_rig_length,
            price_per_night_base,
            min_stay_nights,
            description,
            site_types!inner (code)
          `,
        )
        .eq("campground_id", campgroundId)
        .order("name", { ascending: true });

      if (error) {
        return pgerrorToActionResultError(error);
      }

      // @ts-expect-error — types are loose because of the join
      const sites = data.map(toDomain);

      return {
        success: true,
        data: sites,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);

export const getSiteOfCampground = cache(
  async (siteId: string): Promise<ActionResult<Site>> => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("sites")
        .select(
          ` id,
            name,
            site_type_id,
            max_rig_length,
            price_per_night_base,
            min_stay_nights,
            description,
            site_types!inner (code)
          `,
        )
        .eq("id", siteId)
        .single();

      if (error) {
        return pgerrorToActionResultError(error);
      }

      // @ts-expect-error — types are loose because of the join
      const site = toDomain(data);

      return {
        success: true,
        data: site,
      };
    } catch (err) {
      return unhandledErrortoActionResultError(err);
    }
  },
);
