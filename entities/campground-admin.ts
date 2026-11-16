export interface CampgroundAdmin {
  id: string;
  owner_id: string;
  owner_full_name: string;
  owner_email: string;
  name: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  /** Listing currency for site base prices (CAD / USD / MXN). */
  currency: string;
  location: {
    lat: number;
    lng: number;
  };
  website: string;
  phone: string;
  active: boolean;
}
