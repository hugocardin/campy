import type { DrivewayType } from "@/lib/driveway-type";
import type { ElectricityAmp } from "@/lib/electricity-amps";
import type { PricingRulesObject } from "@/lib/site-pricing-rules";

export interface Site {
  id: string;
  name: string;
  description: string;
  site_type_id: number;
  site_type_code: string;
  max_rig_length: number | null;
  price_per_night: number;
  /**
   * Opaque jsonb object (`sites.pricing_rules`, default `{}`).
   * Not evaluated by search/booking until Phase D — admin edit only.
   */
  pricing_rules: PricingRulesObject;
  min_stay_nights: number;
  /** Available pedestal amps; empty = no electricity. */
  electricity_amps: ElectricityAmp[];
  /** Pull-through / back-in; null = unknown. */
  driveway_type: DrivewayType | null;
  /** Public park-media photo URLs (may be empty). */
  photos: string[];
}
