"use client";

import { Campground } from "@/entities/campground";
import { Link } from "@/i18n/navigation";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes } from "@/lib/routes";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

type Props = {
  campgrounds: Campground[];
  className?: string;
};

type LocatedCampground = Campground & {
  location: { lat: number; lng: number };
};

const DEFAULT_CENTER: LatLngTuple = [56.1304, -106.3468]; // Canada
const DEFAULT_ZOOM = 4;

function hasValidCoords(
  campground: Campground,
): campground is LocatedCampground {
  const loc = campground.location;
  if (!loc) return false;
  const { lat, lng } = loc;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Reject Null Island — usually means Number(null) or missing geocode.
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function FitMarkers({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (positions.length === 1) {
      map.setView(positions[0], 9);
      return;
    }
    map.fitBounds(positions, { padding: [48, 48], maxZoom: 10 });
  }, [map, positions]);

  return null;
}

// Served from /public/leaflet (copied from leaflet/dist/images) — not unpkg.
const DefaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function CampgroundsMap({ campgrounds, className }: Props) {
  const t = useTranslations("search.controls");

  const withCoords = useMemo(
    () => campgrounds.filter(hasValidCoords),
    [campgrounds],
  );

  const positions: LatLngTuple[] = useMemo(
    () => withCoords.map((c) => [c.location.lat, c.location.lng]),
    [withCoords],
  );

  if (withCoords.length === 0) {
    return (
      <div
        className={
          className ??
          "absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground"
        }
      >
        <p className="text-sm p-6 text-center">{t("mapEmpty")}</p>
      </div>
    );
  }

  return (
    <div className={className ?? "absolute inset-0 h-full w-full"}>
      <MapContainer
        center={positions[0] ?? DEFAULT_CENTER}
        zoom={positions.length === 1 ? 9 : DEFAULT_ZOOM}
        className="h-full w-full z-0 rounded-xl"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          // Demo OK on OSM's public tiles. Switch to a provider with an
          // SLA/API key (or self-host) before launch — public tile usage
          // policy is not for production booking traffic. Prefer the
          // non-{s} URL; the subdomain pattern is deprecated by OSM.
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMarkers positions={positions} />
        {withCoords.map((campground) => (
          <Marker
            key={campground.id}
            position={[campground.location.lat, campground.location.lng]}
          >
            <Popup>
              <div className="space-y-1 min-w-40">
                <p className="font-medium text-sm leading-tight">
                  {campground.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCampgroundLocation(
                    campground.city,
                    campground.province,
                  )}
                </p>
                <Link
                  href={routes.campgroundDetail(campground.id)}
                  className="text-xs text-primary hover:underline"
                >
                  {t("viewCampground")}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
