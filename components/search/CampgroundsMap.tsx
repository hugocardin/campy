"use client";

import { Campground } from "@/entities/campground";
import { Link } from "@/i18n/navigation";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes, type CampgroundDetailQuery } from "@/lib/routes";
import { cn } from "@/lib/utils";
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
  /** Changes when the active search identity changes (q/filters/geo). */
  searchKey?: string;
  /** Carry guest rig prefs into detail popup links (#34). */
  detailQuery?: CampgroundDetailQuery;
  className?: string;
};

type LocatedCampground = Campground & {
  location: { lat: number; lng: number };
};

const DEFAULT_CENTER: LatLngTuple = [56.1304, -106.3468]; // Canada
const DEFAULT_ZOOM = 4;
/** Stable empty array so FitMarkers' effect does not re-fire every render. */
const NO_POSITIONS: LatLngTuple[] = [];

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

/**
 * Remember the last mappable result set across empty searches so pins are not
 * blanked on soft navigation. Intentionally client-session only: a hard load /
 * refresh / shared empty-search URL starts with no prior pins (passing a full
 * catalog for that case is out of scope for #22).
 *
 * When the current search has results, always sync — including clearing when
 * results exist but none are mappable — so sticky pins never lag two searches.
 */
function useStickyLocated(
  locatedFromProps: LocatedCampground[],
  isEmptySearch: boolean,
): LocatedCampground[] {
  const [stickyLocated, setStickyLocated] = useState(locatedFromProps);
  if (!isEmptySearch && locatedFromProps !== stickyLocated) {
    setStickyLocated(locatedFromProps);
  }
  return stickyLocated;
}

/**
 * Live region that re-announces when `announcementKey` changes even if the
 * message string is identical (two consecutive empty searches). Remount via
 * `key` so screen readers see a DOM change without setState-during-render.
 */
function MapStatusLiveRegion({
  announcementKey,
  message,
}: {
  announcementKey: string;
  message: string;
}) {
  return (
    <p key={announcementKey} role="status" className="sr-only">
      {message}
    </p>
  );
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
  /** When true (empty non-geo search), leave the current map view alone. */
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
  searchKey = "",
  detailQuery,
  className,
}: Props) {
  const t = useTranslations("search.controls");

  const locatedFromProps = useMemo(
    () => campgrounds.filter(hasValidCoords),
    [campgrounds],
  );

  const isEmptySearch = campgrounds.length === 0;
  const stickyLocated = useStickyLocated(locatedFromProps, isEmptySearch);
  const showingStalePins = isEmptySearch && stickyLocated.length > 0;
  const displayedCampgrounds = showingStalePins
    ? stickyLocated
    : locatedFromProps;

  const positions: LatLngTuple[] = useMemo(
    () =>
      displayedCampgrounds.map((c) => [c.location.lat, c.location.lng]),
    [displayedCampgrounds],
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
  // Use current-search located pins (not sticky) so geo + ungeocoded results
  // still explain why the circle has no markers.
  const showMapEmptyOverlay =
    !isEmptySearch && locatedFromProps.length === 0;

  const statusMessage = showNoResultsOverlay
    ? t("noResults")
    : showMapEmptyOverlay
      ? t("mapEmpty")
      : "";
  // Include message kind so empty↔mapEmpty transitions also re-announce.
  const statusAnnouncementKey = `${searchKey}|${statusMessage}`;

  return (
    <div
      className={cn("relative", className ?? "absolute inset-0 h-full w-full")}
    >
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
          // Empty search: don't pull the view toward leftover/stale pins;
          // geo empty still fits the circle via searchCenter + radiusKm.
          positions={isEmptySearch ? NO_POSITIONS : positions}
          searchCenter={centerTuple}
          radiusKm={radiusKm}
          freezeView={isEmptySearch && !centerTuple}
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
        {displayedCampgrounds.map((campground) => (
          <Marker
            key={campground.id}
            position={[campground.location.lat, campground.location.lng]}
            opacity={showingStalePins ? 0.5 : 1}
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
                  href={routes.campgroundDetail(campground.id, detailQuery)}
                  className="text-xs text-primary hover:underline"
                >
                  {t("viewCampground")}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <MapStatusLiveRegion
        announcementKey={statusAnnouncementKey}
        message={statusMessage}
      />
      {showNoResultsOverlay || showMapEmptyOverlay ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex justify-center pl-14 pr-3 pt-3"
        >
          <p className="max-w-[calc(100%-0.5rem)] rounded-md border border-border bg-background/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
            {statusMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
