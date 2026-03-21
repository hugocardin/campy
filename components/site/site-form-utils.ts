import { Site } from "@/entities/sites";

export type SiteFormData = {
  id?: string;
  name: string;
  description: string;
  site_type_id: string;
  max_rig_length: string;
  price_per_night: string;
  min_stay_nights: string;
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
  };
}
