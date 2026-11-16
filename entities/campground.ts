import type { GuestPriceCurrency } from "@/lib/campground-price";

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
  /** Metres from search center when geo search is active; otherwise omitted. */
  distanceMeters?: number | null;
  /**
   * Min `sites.price_per_night_base` among sites matching current guest
   * filters (or all sites when no site filters). From search RPCs (#24).
   */
  minPricePerNight?: number | null;
  /**
   * Listing currency for `minPricePerNight` / site base prices
   * (`campgrounds.currency`: CAD / USD / MXN). Normalized at the data boundary.
   */
  priceCurrency: GuestPriceCurrency;
  website: string;
  phone: string;
}
