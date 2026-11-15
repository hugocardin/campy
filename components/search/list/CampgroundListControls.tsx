"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  CampgroundRadiusKm,
  CampgroundSort,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  campgroundSortQueryValue,
  parseCampgroundGeo,
  parseCampgroundSort,
  roundCampgroundCoord,
} from "@/lib/campground-search";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LocateFixed, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  resultCount: number;
  provinces: string[];
};

const ALL_PROVINCES = "__all__";

type QueryState = {
  q: string;
  sort: CampgroundSort;
  province: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
};

type LatestParams = Omit<QueryState, "q">;

export default function CampgroundListControls({
  resultCount,
  provinces,
}: Props) {
  const t = useTranslations("search.controls");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const qParam = searchParams.get("q") ?? "";
  const provinceParam = searchParams.get("province") ?? "";
  const geo = parseCampgroundGeo({
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    radiusKm: searchParams.get("radiusKm") ?? undefined,
  });
  const sortParam = parseCampgroundSort(
    searchParams.get("sort") ?? undefined,
    { geoActive: Boolean(geo) },
  );

  const [preferredRadius, setPreferredRadius] = useState<CampgroundRadiusKm>(
    geo?.radiusKm ?? DEFAULT_CAMPGROUND_RADIUS_KM,
  );
  const [prevGeoRadius, setPrevGeoRadius] = useState(geo?.radiusKm);
  const [search, setSearch] = useState(qParam);
  const [prevQParam, setPrevQParam] = useState(qParam);
  const [lastPushedQ, setLastPushedQ] = useState(qParam);

  const debounceTimeoutRef = useRef<number | null>(null);
  const geoRequestIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const latestParamsRef = useRef<LatestParams & { q: string }>({
    q: search,
    sort: sortParam,
    province: provinceParam,
    lat: geo?.lat,
    lng: geo?.lng,
    radiusKm: geo?.radiusKm ?? preferredRadius,
  });

  // Sync input from URL only for external changes (back/forward / Clear).
  if (qParam !== prevQParam) {
    setPrevQParam(qParam);
    if (qParam !== lastPushedQ) {
      setLastPushedQ(qParam);
      if (search.trim() !== qParam) {
        setSearch(qParam);
      }
    }
  }

  // Keep preferred radius in sync when geo URL changes (e.g. back/forward).
  if (geo?.radiusKm != null && geo.radiusKm !== prevGeoRadius) {
    setPrevGeoRadius(geo.radiusKm);
    setPreferredRadius(geo.radiusKm);
  } else if (geo?.radiusKm == null && prevGeoRadius != null) {
    setPrevGeoRadius(undefined);
  }

  useEffect(() => {
    latestParamsRef.current = {
      q: search,
      sort: sortParam,
      province: provinceParam,
      lat: geo?.lat,
      lng: geo?.lng,
      radiusKm: geo?.radiusKm ?? preferredRadius,
    };
  }, [
    search,
    sortParam,
    provinceParam,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    preferredRadius,
  ]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      geoRequestIdRef.current += 1;
    };
  }, []);

  function clearDebounce() {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }

  function cancelGeolocation() {
    geoRequestIdRef.current += 1;
    setGeoBusy(false);
  }

  function replaceQuery(next: QueryState) {
    const trimmedQ = next.q.trim();
    setLastPushedQ(trimmedQ);
    latestParamsRef.current = {
      q: next.q,
      sort: next.sort,
      province: next.province,
      lat: next.lat,
      lng: next.lng,
      radiusKm: next.radiusKm,
    };

    const params = new URLSearchParams();
    if (trimmedQ) {
      params.set("q", trimmedQ);
    }
    const geoActive = next.lat != null && next.lng != null;
    const sortQuery = campgroundSortQueryValue(next.sort, geoActive);
    if (sortQuery) {
      params.set("sort", sortQuery);
    }
    if (next.province) {
      params.set("province", next.province);
    }
    if (
      next.lat != null &&
      next.lng != null &&
      next.radiusKm != null &&
      Number.isFinite(next.lat) &&
      Number.isFinite(next.lng)
    ) {
      params.set("lat", String(roundCampgroundCoord(next.lat)));
      params.set("lng", String(roundCampgroundCoord(next.lng)));
      params.set("radiusKm", String(next.radiusKm));
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === qParam || trimmed === lastPushedQ) return;

    clearDebounce();
    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      const { sort, province, lat, lng, radiusKm } = latestParamsRef.current;
      replaceQuery({
        q: search,
        sort,
        province,
        lat,
        lng,
        radiusKm,
      });
    }, 300);

    return clearDebounce;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on `search`
  }, [search, qParam, lastPushedQ]);

  function onNearMe() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t("geoUnavailable"));
      return;
    }
    const requestId = ++geoRequestIdRef.current;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelledRef.current || requestId !== geoRequestIdRef.current) {
          return;
        }
        setGeoBusy(false);
        clearDebounce();
        const radiusKm =
          latestParamsRef.current.radiusKm ?? preferredRadius;
        replaceQuery({
          q: latestParamsRef.current.q,
          sort: "distance",
          province: latestParamsRef.current.province,
          lat: roundCampgroundCoord(pos.coords.latitude),
          lng: roundCampgroundCoord(pos.coords.longitude),
          radiusKm,
        });
      },
      (err) => {
        if (cancelledRef.current || requestId !== geoRequestIdRef.current) {
          return;
        }
        setGeoBusy(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? t("geoDenied")
            : t("geoUnavailable"),
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  }

  const hasFilters = Boolean(search || provinceParam || geo);
  const controlsDisabled = geoBusy;

  return (
    <div
      className={`space-y-4 md:space-y-0 md:flex md:flex-wrap md:items-end md:gap-4 lg:gap-6 ${isPending || geoBusy ? "opacity-80" : ""}`}
    >
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("searchPlaceholder")}
          disabled={controlsDisabled}
        />
      </div>

      <Select
        value={sortParam}
        disabled={controlsDisabled}
        onValueChange={(value) => {
          clearDebounce();
          replaceQuery({
            q: search,
            sort: parseCampgroundSort(value, { geoActive: Boolean(geo) }),
            province: latestParamsRef.current.province,
            lat: latestParamsRef.current.lat,
            lng: latestParamsRef.current.lng,
            radiusKm: latestParamsRef.current.radiusKm,
          });
        }}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("sortLabel")} />
        </SelectTrigger>
        <SelectContent>
          {geo ? (
            <SelectItem value="distance">{t("sortDistance")}</SelectItem>
          ) : null}
          <SelectItem value="name">{t("sortNameAsc")}</SelectItem>
          <SelectItem value="name-desc">{t("sortNameDesc")}</SelectItem>
          <SelectItem value="city">{t("sortCity")}</SelectItem>
          <SelectItem value="province">{t("sortProvince")}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={provinceParam || ALL_PROVINCES}
        disabled={controlsDisabled}
        onValueChange={(value) => {
          clearDebounce();
          replaceQuery({
            q: search,
            sort: latestParamsRef.current.sort,
            province: value === ALL_PROVINCES ? "" : value,
            lat: latestParamsRef.current.lat,
            lng: latestParamsRef.current.lng,
            radiusKm: latestParamsRef.current.radiusKm,
          });
        }}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("provinceLabel")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROVINCES}>{t("provinceAll")}</SelectItem>
          {provinces.map((province) => (
            <SelectItem key={province} value={province}>
              {province}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {geo ? (
        <Select
          value={String(geo.radiusKm)}
          disabled={controlsDisabled}
          onValueChange={(value) => {
            clearDebounce();
            const nextRadius = (CAMPGROUND_RADIUS_KM_PRESETS as readonly number[]).includes(
              Number(value),
            )
              ? (Number(value) as CampgroundRadiusKm)
              : DEFAULT_CAMPGROUND_RADIUS_KM;
            setPreferredRadius(nextRadius);
            replaceQuery({
              q: search,
              sort: latestParamsRef.current.sort,
              province: latestParamsRef.current.province,
              lat: latestParamsRef.current.lat,
              lng: latestParamsRef.current.lng,
              radiusKm: nextRadius,
            });
          }}
        >
          <SelectTrigger className="w-40" aria-label={t("radiusLabel")}>
            <SelectValue placeholder={t("radiusLabel")} />
          </SelectTrigger>
          <SelectContent>
            {CAMPGROUND_RADIUS_KM_PRESETS.map((km) => (
              <SelectItem key={km} value={String(km)}>
                {t("radiusKm", { km })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Button
        type="button"
        variant={geo ? "default" : "outline"}
        onClick={onNearMe}
        disabled={geoBusy}
        aria-label={t("nearMe")}
      >
        <LocateFixed className="h-4 w-4" />
        {geoBusy ? t("nearMeLocating") : t("nearMe")}
      </Button>

      {hasFilters || geoBusy ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearDebounce();
            cancelGeolocation();
            setSearch("");
            setGeoError(null);
            replaceQuery({
              q: "",
              sort: "name",
              province: "",
            });
          }}
        >
          {t("clearFilters")}
        </Button>
      ) : null}

      <div className="text-sm text-muted-foreground md:ml-auto">
        {t("resultCount", { count: resultCount })}
      </div>

      {geoError ? (
        <p className="basis-full text-sm text-destructive" role="status">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
