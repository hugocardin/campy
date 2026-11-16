"use client";

import { Campground } from "@/entities/campground";
import { Link } from "@/i18n/navigation";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes } from "@/lib/routes";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

type Props = {
  campgrounds: Campground[];
  searchCenter?: { lat: number; lng: number };
  radiusKm?: number;
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

function FitMarkers({
  positions,
  searchCenter,
  radiusKm,
  freezeView,
}: {
  positions: LatLngTuple[];
  searchCenter?: LatLngTuple;
  radiusKm?: number;
  /** When true (e.g. empty search), leave the current map view alone. */
  freezeView?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (freezeView) return;

    if (
      searchCenter &&
      radiusKm != null &&
      Number.isFinite(radiusKm) &&
      radiusKm > 0
    ) {
      // toBounds(sizeInMeters) spans size/2 each side — pass diameter so the
      // full search circle fits, then extend with any result markers.
      const bounds = L.latLng(searchCenter).toBounds(radiusKm * 2000);
      for (const position of positions) {
        bounds.extend(position);
      }
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 });
      return;
    }

    const all = searchCenter ? [...positions, searchCenter] : positions;
    if (all.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (all.length === 1) {
      map.setView(all[0], 9);
      return;
    }
    map.fitBounds(all, { padding: [48, 48], maxZoom: 10 });
  }, [map, positions, searchCenter, radiusKm, freezeView]);

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

export default function CampgroundsMap({
  campgrounds,
  searchCenter,
  radiusKm,
  className,
}: Props) {
  const t = useTranslations("search.controls");

  const locatedFromProps = useMemo(
    () => campgrounds.filter(hasValidCoords),
    [campgrounds],
  );

  // Keep the last mappable set so an empty search does not blank pins.
  // Adjust during render (React-approved) — avoids setState-in-effect / refs-in-render lint.
  const [stickyLocated, setStickyLocated] = useState(locatedFromProps);
  if (
    locatedFromProps.length > 0 &&
    locatedFromProps !== stickyLocated
  ) {
    setStickyLocated(locatedFromProps);
  }

  const isEmptySearch = campgrounds.length === 0;
  const withCoords =
    isEmptySearch && stickyLocated.length > 0
      ? stickyLocated
      : locatedFromProps;

  const positions: LatLngTuple[] = useMemo(
    () => withCoords.map((c) => [c.location.lat, c.location.lng]),
    [withCoords],
  );

  const centerLat = searchCenter?.lat;
  const centerLng = searchCenter?.lng;
  const centerTuple = useMemo<LatLngTuple | undefined>(
    () =>
      centerLat != null && centerLng != null
        ? [centerLat, centerLng]
        : undefined,
    [centerLat, centerLng],
  );

  const radiusMeters =
    radiusKm != null && Number.isFinite(radiusKm) && radiusKm > 0
      ? radiusKm * 1000
      : undefined;

  const showNoResultsOverlay = isEmptySearch;
  const showMapEmptyOverlay =
    !isEmptySearch && withCoords.length === 0 && !centerTuple;

  return (
    <div className={className ?? "absolute inset-0 h-full w-full"}>
      <MapContainer
        center={centerTuple ?? positions[0] ?? DEFAULT_CENTER}
        zoom={positions.length === 1 && !centerTuple ? 9 : DEFAULT_ZOOM}
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
        <FitMarkers
          positions={positions}
          searchCenter={centerTuple}
          radiusKm={radiusKm}
          freezeView={isEmptySearch}
        />
        {centerTuple && radiusMeters != null ? (
          <Circle
            center={centerTuple}
            radius={radiusMeters}
            pathOptions={{
              color: "#0f766e",
              fillColor: "#14b8a6",
              fillOpacity: 0.08,
              weight: 1.5,
            }}
          />
        ) : null}
        {centerTuple ? (
          <CircleMarker
            center={centerTuple}
            radius={8}
            pathOptions={{
              color: "#0f766e",
              fillColor: "#14b8a6",
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Popup>
              <p className="text-sm font-medium">{t("searchCenter")}</p>
            </Popup>
          </CircleMarker>
        ) : null}
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

      {showNoResultsOverlay || showMapEmptyOverlay ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center p-3">
          <p className="rounded-md border border-border bg-background/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {showNoResultsOverlay ? t("noResults") : t("mapEmpty")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
