import type { CampgroundAdmin } from "@/entities/campground-admin";
import {
  GUEST_PRICE_CURRENCY,
  resolveCampgroundPriceCurrency,
} from "@/lib/campground-price";

export type CampgroundFormData = {
  id?: string;
  name: string;
  owner_id: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  currency: string;
  website: string;
  phone: string;
  location: {
    lat: string;
    lng: string;
  };
};

/**
 * Converts a CampgroundAdmin entity (or null for create) into the shape expected by CampgroundFormClient's initialData prop.
 */
export function toCampgroundFormData(
  campground: CampgroundAdmin,
): CampgroundFormData | undefined {
  if (!campground) {
    return undefined;
  }

  return {
    id: campground.id,
    name: campground.name ?? "",
    owner_id: campground.owner_id ?? "",
    description: campground.description ?? "",
    address: campground.address ?? "",
    city: campground.city ?? "",
    province: campground.province ?? "",
    country: campground.country ?? "",
    currency: resolveCampgroundPriceCurrency(
      campground.currency ?? GUEST_PRICE_CURRENCY,
    ),
    website: campground.website ?? "",
    phone: campground.phone ?? "",
    location: {
      lat: String(campground.location?.lat ?? ""),
      lng: String(campground.location?.lng ?? ""),
    },
  };
}
