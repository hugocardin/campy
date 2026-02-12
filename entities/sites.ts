export interface Site {
  id: string;
  name: string;
  description: string;
  site_type_id: number;
  site_type_code: string;
  max_rig_length: number | null;
  price_per_night: number;
  //   pricing_rules
  min_stay_nights: number;
}
