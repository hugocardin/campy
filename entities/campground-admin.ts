import type { GuestPriceCurrency } from "@/lib/campground-price";

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
  currency: GuestPriceCurrency;
  location: {
    lat: number;
    lng: number;
  };
  website: string;
  phone: string;
  active: boolean;
  /** FK to `commission_types`; null when unset. */
  commission_type_id: number | null;
  /** Resolved `commission_types.name` when type is set (`percent` | `fixed`). */
  commission_type_name: string | null;
  /** Platform commission amount; 0 when unset. Percent or fixed per type. */
  commission_value: number;
  /** Public park-media cover URL, or null when unset. */
  coverPhoto: string | null;
}
