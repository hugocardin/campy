import { Site } from "@/entities/sites";
import type { DrivewayType } from "@/lib/driveway-type";
import type { ElectricityAmp } from "@/lib/electricity-amps";
import { normalizeElectricityAmps } from "@/lib/electricity-amps";
import { formatPricingRulesForEditor } from "@/lib/site-pricing-rules";

export type SiteFormData = {
  id?: string;
  name: string;
  description: string;
  site_type_id: string;
  max_rig_length: string;
  price_per_night: string;
  min_stay_nights: string;
  electricity_amps: ElectricityAmp[];
  driveway_type: DrivewayType | "";
  /** Pretty-printed JSON object text for the pricing_rules editor. */
  pricing_rules: string;
  /** Loaded column had a non-object shape (pre-CHECK legacy). */
  pricing_rules_unexpected?: boolean;
};

/**
 * Converts a Site entity (or null for create) into the shape expected by SiteFormClient's initialData prop.
 */
export function toSiteFormData(site: Site): SiteFormData | undefined {
  if (!site) {
    return undefined;
  }

  return {
    id: site.id,
    name: site.name ?? "",
    description: site.description ?? "",
    site_type_id: String(site.site_type_id),
    max_rig_length: String(site.max_rig_length ?? ""),
    price_per_night: String(site.price_per_night ?? ""),
    min_stay_nights: String(site.min_stay_nights ?? ""),
    electricity_amps: normalizeElectricityAmps(site.electricity_amps ?? []),
    driveway_type: site.driveway_type ?? "",
    pricing_rules: site.pricing_rules_unexpected
      ? "{}"
      : formatPricingRulesForEditor(site.pricing_rules),
    pricing_rules_unexpected: site.pricing_rules_unexpected === true,
  };
}
