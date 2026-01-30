export interface Amenity {
  id: string;
  code: string;
  category_id: number;
  category_code: string;
}

export interface AmenityCreateInput {
  code: string;
  category_id: number;
}
