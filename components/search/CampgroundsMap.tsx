"use client";

import { Campground } from "@/entities/campground";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  type CampgroundRadiusKm,
  roundCampgroundCoord,
} from "@/lib/campground-search";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes, type CampgroundDetailQuery } from "@/lib/routes";
import { cn } from "@/lib/utils";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

type Props = {
  campgrounds: Campground[];
  searchCenter?: { lat: number; lng: number };
  radiusKm?: number;
  /** Changes when the active search identity changes (q/filters/geo). */
  searchKey?: string;
  /** Free-text query for empty-state a11y copy. */
  searchQuery?: string;
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
 * Persistent live region that re-announces when `announcementKey` changes even
 * if the message string is identical (two consecutive empty searches).
 * Clear on key change (render-time adjust), then set the message after a short
 * delay so screen readers commit the empty→text transition (#24 / #28).
 */
function MapStatusLiveRegion({
  announcementKey,
  message,
}: {
  announcementKey: string;
  message: string;
}) {
  const [state, setState] = useState({ key: announcementKey, text: message });

  if (announcementKey !== state.key) {
    setState({ key: announcementKey, text: "" });
  }

  useEffect(() => {
    if (state.text !== "") return;
    const timer = window.setTimeout(() => {
      setState((prev) =>
        prev.key === announcementKey ? { ...prev, text: message } : prev,
      );
    }, 50);
    return () => window.clearTimeout(timer);
  }, [announcementKey, message, state.text]);

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {state.text}
    </p>
  );
}

/**
 * Snap viewport half-span (center → nearest edge) up to a radius preset.
 */
function radiusKmFromMapViewport(map: L.Map): CampgroundRadiusKm {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const halfHeightKm =
    center.distanceTo(L.latLng(bounds.getNorth(), center.lng)) / 1000;
  const halfWidthKm =
    center.distanceTo(L.latLng(center.lat, bounds.getEast())) / 1000;
  const km = Math.min(halfHeightKm, halfWidthKm);
  for (const preset of CAMPGROUND_RADIUS_KM_PRESETS) {
    if (km <= preset) return preset;
  }
  return CAMPGROUND_RADIUS_KM_PRESETS[CAMPGROUND_RADIUS_KM_PRESETS.length - 1];
}

/**
 * Notify parent on user-driven map moves (pan / zoom / keyboard).
 * Ignores programmatic fitBounds/setView via suppressRef (#39 review).
 */
function MapUserMoveWatcher({
  onUserMove,
  suppressRef,
}: {
  onUserMove: () => void;
  suppressRef: MutableRefObject<boolean>;
}) {
  useMapEvents({
    moveend: () => {
      if (suppressRef.current) return;
      onUserMove();
    },
  });
  return null;
}

/** Captures map instance for "Search this area" outside the leaflet tree. */
function MapHandle({
  onReady,
}: {
  onReady: (map: L.Map) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function FitMarkers({
  positions,
  searchCenter,
  radiusKm,
  freezeView,
  suppressRef,
}: {
  positions: LatLngTuple[];
  searchCenter?: LatLngTuple;
  radiusKm?: number;
  /** When true (empty non-geo search), leave the current map view alone. */
  freezeView?: boolean;
  suppressRef: MutableRefObject<boolean>;
}) {
  const map = useMap();

  useEffect(() => {
    if (freezeView) return;

    const runProgrammatic = (fn: () => void): (() => void) => {
      // Register before fn(): Leaflet can fire moveend synchronously inside
      // setView/fitBounds (same view, large jump, zero-size container).
      // Timeout fallback: no-op setView/fitBounds may never emit moveend.
      suppressRef.current = true;
      let cleared = false;
      let raf = 0;
      const clear = () => {
        if (cleared) return;
        cleared = true;
        window.clearTimeout(fallback);
        map.off("moveend", clear);
        raf = requestAnimationFrame(() => {
          raf = 0;
          suppressRef.current = false;
        });
      };
      const fallback = window.setTimeout(clear, 500);
      map.once("moveend", clear);
      fn();
      return () => {
        window.clearTimeout(fallback);
        map.off("moveend", clear);
        const hadPendingRaf = raf !== 0;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        // Release if we still owned suppress, or if we cancelled a rAF that
        // would have released it (newer effect re-sets suppress afterward).
        if (!cleared || hadPendingRaf) {
          cleared = true;
          suppressRef.current = false;
        }
      };
    };

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
      return runProgrammatic(() => {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 });
      });
    }

    const all = searchCenter ? [...positions, searchCenter] : positions;
    if (all.length === 0) {
      return runProgrammatic(() => {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      });
    }
    if (all.length === 1) {
      return runProgrammatic(() => {
        map.setView(all[0], 9);
      });
    }
    return runProgrammatic(() => {
      map.fitBounds(all, { padding: [48, 48], maxZoom: 10 });
    });
  }, [map, positions, searchCenter, radiusKm, freezeView, suppressRef]);

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
  searchQuery,
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

  const trimmedQuery = searchQuery?.trim() ?? "";
  const statusMessage = showNoResultsOverlay
    ? trimmedQuery
      ? t("noResultsFor", { query: trimmedQuery })
      : t("noResults")
    : showMapEmptyOverlay
      ? t("mapEmpty")
      : "";
  // Include message kind so empty↔mapEmpty transitions also re-announce.
  const statusAnnouncementKey = `${searchKey}|${statusMessage}`;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  /** Set to current searchKey when the user moves the map — clears on new search. */
  const [movedForKey, setMovedForKey] = useState<string | null>(null);
  const showSearchArea = movedForKey === searchKey;
  const [pendingArea, startAreaTransition] = useTransition();
  const suppressUserMoveRef = useRef(false);

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
          suppressRef={suppressUserMoveRef}
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
        <MapHandle onReady={setMapInstance} />
        <MapUserMoveWatcher
          suppressRef={suppressUserMoveRef}
          onUserMove={() => setMovedForKey(searchKey)}
        />
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
      {showSearchArea ? (
        <div className="absolute inset-x-0 bottom-3 z-[500] flex justify-center pointer-events-none">
          <button
            type="button"
            className="pointer-events-auto rounded-md border border-border bg-background/95 px-3 py-2 text-sm font-medium shadow-sm hover:bg-background disabled:opacity-60"
            disabled={pendingArea || !mapInstance}
            onClick={() => {
              if (!mapInstance) return;
              const center = mapInstance.getCenter();
              const lat = roundCampgroundCoord(center.lat);
              const lng = roundCampgroundCoord(center.lng);
              if (lat === 0 && lng === 0) return;

              // Keep site filters (amps/water/…) but drop place/text/province
              // so the viewport search matches what the user sees (#39).
              const next = new URLSearchParams(searchParams.toString());
              next.set("lat", String(lat));
              next.set("lng", String(lng));
              next.set("radiusKm", String(radiusKmFromMapViewport(mapInstance)));
              next.delete("place");
              next.delete("q");
              next.delete("province");
              const qs = next.toString();
              startAreaTransition(() => {
                router.replace(qs ? `${pathname}?${qs}` : pathname);
                setMovedForKey(null);
              });
            }}
          >
            {t("searchThisArea")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
