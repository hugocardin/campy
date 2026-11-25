import { Campground } from "@/entities/campground";
import { resolveCampgroundPriceCurrency } from "@/lib/campground-price";
import { normalizeParkMediaUrl } from "@/lib/park-media";

/** Guest / search RPC row shape — `cover_photo` required (#57). */
export type CampgroundRow = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  currency?: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  /** Required: search RPCs + v_campgrounds return cover_photo (#57). */
  cover_photo: string | null;
  distance_m?: number | null;
  min_price_per_night?: number | null;
  price_currency?: string | null;
};

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toCampgroundDomain(row: CampgroundRow): Campground {
  const lat = toFiniteNumber(row.latitude);
  const lng = toFiniteNumber(row.longitude);
  const location =
    lat != null && lng != null ? { lat, lng } : null;
  const distanceMeters =
    row.distance_m == null ? undefined : toFiniteNumber(row.distance_m);
  const minPrice =
    row.min_price_per_night == null
      ? undefined
      : toFiniteNumber(Number(row.min_price_per_night));

  const priceCurrency = resolveCampgroundPriceCurrency(
    row.price_currency ?? row.currency,
  );

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    city: row.city,
    province: row.province,
    country: row.country,
    location,
    distanceMeters: distanceMeters ?? undefined,
    minPricePerNight: minPrice ?? undefined,
    priceCurrency,
    website: row.website ?? "",
    phone: row.phone ?? "",
    coverPhoto: normalizeParkMediaUrl(row.cover_photo),
  };
}
