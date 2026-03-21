export interface CampgroundCreateUpdateInput {
  id: string | undefined;
  name: string;
  owner_id: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  website: string;
  phone: string;
  location: {
    lat: number;
    lng: number;
  };
}
