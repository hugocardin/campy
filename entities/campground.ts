export interface Campground {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  /** Null when latitude/longitude are missing or invalid. */
  location: {
    lat: number;
    lng: number;
  } | null;
  website: string;
  phone: string;
}
