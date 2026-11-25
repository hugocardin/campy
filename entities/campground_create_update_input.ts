import type { GuestPriceCurrency } from "@/lib/campground-price";

export interface CampgroundCreateUpdateInput {
  id: string | undefined;
  name: string;
  owner_id: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  /** Listing currency for site base prices (CAD / USD / MXN). */
  currency: GuestPriceCurrency;
  website: string;
  phone: string;
  location: {
    lat: number;
    lng: number;
  };
  /** Nullable FK to `commission_types`. */
  commission_type_id: number | null;
  /** Commission amount (percent 0–100 or fixed ≥0). */
  commission_value: number | null;
}
