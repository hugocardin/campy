export interface Campground {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  location: {
    lat: number;
    lng: number;
  };
  website: string;
  phone: string;
}
