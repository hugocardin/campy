export interface Campground {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  location: {
    lat: number;
    lng: number;
  };
  website: string;
  phone: string;
}
