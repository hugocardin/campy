export interface SiteCreateUpdateInput {
  id: string | undefined;
  name: string;
  description: string;
  site_type_id: number;
  max_rig_length: number | undefined;
  price_per_night: number;
  min_stay_nights: number | undefined;
}
