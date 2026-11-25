import type { DrivewayType } from "@/lib/driveway-type";
import type { ElectricityAmp } from "@/lib/electricity-amps";
import type { PricingRulesObject } from "@/lib/site-pricing-rules";

export interface SiteCreateUpdateInput {
  id: string | undefined;
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: number | undefined;
  price_per_night: number;
  min_stay_nights: number | undefined;
  electricity_amps: ElectricityAmp[];
  driveway_type: DrivewayType | null;
  /** Parsed jsonb object for `sites.pricing_rules` (never null — use `{}`). */
  pricing_rules: PricingRulesObject;
}
