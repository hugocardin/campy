import { Site } from "@/entities/sites";
import { parseDrivewayType } from "@/lib/driveway-type";
import { normalizeElectricityAmps } from "@/lib/electricity-amps";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { coerceSitePhotoEntries } from "@/lib/park-media";
import { inspectPricingRulesValue } from "@/lib/site-pricing-rules";
import {
  handleDbResponse,
  handleDbSingle,
  handleUnexpectedError,
} from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

type SiteListRow = {
  id: string;
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: number | null;
  price_per_night_base: number;
  min_stay_nights: number;
  electricity_amps: number[] | null;
  driveway_type: string | null;
  photos?: unknown;
  site_types: { code: string };
};

type SiteDetailRow = SiteListRow & {
  pricing_rules: unknown;
};

function toDomainList(row: SiteListRow): Site {
  const driveway = parseDrivewayType(row.driveway_type);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    site_type_id: row.site_type_id,
    site_type_code: row.site_types.code,
    max_rig_length: row.max_rig_length,
    price_per_night: row.price_per_night_base,
    // pricing_rules intentionally omitted — not selected on list / guest.
    min_stay_nights: row.min_stay_nights,
    electricity_amps: normalizeElectricityAmps(row.electricity_amps ?? []),
    driveway_type: driveway === undefined ? null : driveway,
    // Preserve foreign/seed URLs for admin edit/remove; guests filter at render.
    photos: coerceSitePhotoEntries(row.photos),
  };
}

function toDomainDetail(row: SiteDetailRow): Site {
  const site = toDomainList(row);
  const inspected = inspectPricingRulesValue(row.pricing_rules);
  if (inspected.kind === "ok") {
    site.pricing_rules = inspected.data;
  } else if (inspected.kind === "unexpected") {
    site.pricing_rules_unexpected = true;
  }
  return site;
}

export const getSitesOfCampground = cache(
  async (campgroundId: string): Promise<ActionResult<Site[]>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbResponse(
        supabase
          .from("sites")
          .select(
            ` id,
            name,
            site_type_id,
            max_rig_length,
            price_per_night_base,
            min_stay_nights,
            electricity_amps,
            driveway_type,
            description,
            photos,
            site_types!inner (code)
          `,
          )
          .eq("campground_id", campgroundId)
          .order("name", { ascending: true }),
      );

      if (!result.success) {
        return result;
      }

      // @ts-expect-error — types are loose because of the join
      const sites = result.data.map(toDomainList);

      return resultSuccess(sites);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);

export const getSiteOfCampground = cache(
  async (siteId: string): Promise<ActionResult<Site>> => {
    try {
      const supabase = await createClient();

      const result = await handleDbSingle(
        supabase
          .from("sites")
          .select(
            ` id,
            name,
            site_type_id,
            max_rig_length,
            price_per_night_base,
            pricing_rules,
            min_stay_nights,
            electricity_amps,
            driveway_type,
            description,
            photos,
            site_types!inner (code)
          `,
          )
          .eq("id", siteId)
          .single(),
      );

      if (!result.success) {
        return result;
      }

      // @ts-expect-error — types are loose because of the join
      const site = toDomainDetail(result.data);

      return resultSuccess(site);
    } catch (err) {
      return handleUnexpectedError(err);
    }
  },
);
