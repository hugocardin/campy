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
   * Present only when the loader selected the column (single-site admin fetch).
   * List / guest loaders omit it — do not treat absence as `{}`.
   * Not evaluated by search/booking until Phase D.
   */
  pricing_rules?: PricingRulesObject;
  /**
   * True when `pricing_rules` was selected but was not a plain object
   * (should be rare after DB CHECK; kept for defensive UI).
   */
  pricing_rules_unexpected?: boolean;
  min_stay_nights: number;
  /** Available pedestal amps; empty = no electricity. */
  electricity_amps: ElectricityAmp[];
  /** Pull-through / back-in; null = unknown. */
  driveway_type: DrivewayType | null;
  /** Public park-media photo URLs (may be empty). */
  photos: string[];
}
