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
  parseCampgroundGeo,
  parseCampgroundRadiusKm,
  parseCampgroundSort,
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
  const sortParam = parseCampgroundSort(
    searchParams.get("sort") ?? undefined,
  );
  const provinceParam = searchParams.get("province") ?? "";
  const geo = parseCampgroundGeo({
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    radiusKm: searchParams.get("radiusKm") ?? undefined,
  });
  const radiusParam =
    geo?.radiusKm ??
    parseCampgroundRadiusKm(searchParams.get("radiusKm") ?? undefined) ??
    DEFAULT_CAMPGROUND_RADIUS_KM;

  const [search, setSearch] = useState(qParam);
  const [prevQParam, setPrevQParam] = useState(qParam);
  const [lastPushedQ, setLastPushedQ] = useState(qParam);

  const debounceTimeoutRef = useRef<number | null>(null);
  const latestParamsRef = useRef<LatestParams>({
    sort: sortParam,
    province: provinceParam,
    lat: geo?.lat,
    lng: geo?.lng,
    radiusKm: radiusParam,
  });

  // Sync input from URL only for external changes (back/forward / Clear).
  // Skip when qParam is what we ourselves pushed — typing during an in-flight
  // navigation must not be overwritten. External URL changes also reset
  // lastPushedQ so re-typing the old query still navigates.
  if (qParam !== prevQParam) {
    setPrevQParam(qParam);
    if (qParam !== lastPushedQ) {
      setLastPushedQ(qParam);
      if (search.trim() !== qParam) {
        setSearch(qParam);
      }
    }
  }

  // Keep sort/province/geo for debounce timeouts; replaceQuery also writes this
  // synchronously so selects aren't undone by a stale scheduled search.
  useEffect(() => {
    latestParamsRef.current = {
      sort: sortParam,
      province: provinceParam,
      lat: geo?.lat,
      lng: geo?.lng,
      radiusKm: radiusParam,
    };
  }, [sortParam, provinceParam, geo?.lat, geo?.lng, radiusParam]);

  function clearDebounce() {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }

  function replaceQuery(next: QueryState) {
    const trimmedQ = next.q.trim();
    setLastPushedQ(trimmedQ);
    latestParamsRef.current = {
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
    if (next.sort && next.sort !== "name") {
      params.set("sort", next.sort);
    }
    if (next.province) {
      params.set("province", next.province);
    }
    if (
      next.lat != null &&
      next.lng != null &&
      Number.isFinite(next.lat) &&
      Number.isFinite(next.lng)
    ) {
      params.set("lat", String(next.lat));
      params.set("lng", String(next.lng));
    }
    // Persist radius whenever geo coords are active, or when the user picked
    // a non-default preset ahead of Near me.
    if (
      next.radiusKm != null &&
      (next.lat != null || next.radiusKm !== DEFAULT_CAMPGROUND_RADIUS_KM)
    ) {
      params.set("radiusKm", String(next.radiusKm));
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  useEffect(() => {
    const trimmed = search.trim();
    // Skip while URL catches up to a value we already pushed (incl. Clear).
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
    // Select/Clear cancel via clearDebounce before their own replaceQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on `search`
  }, [search, qParam, lastPushedQ]);

  function onNearMe() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError(t("geoUnavailable"));
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        clearDebounce();
        replaceQuery({
          q: search,
          sort: latestParamsRef.current.sort,
          province: latestParamsRef.current.province,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radiusKm:
            latestParamsRef.current.radiusKm ?? DEFAULT_CAMPGROUND_RADIUS_KM,
        });
      },
      (err) => {
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
        />
      </div>

      <Select
        value={sortParam}
        onValueChange={(value) => {
          clearDebounce();
          replaceQuery({
            q: search,
            sort: parseCampgroundSort(value),
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
          <SelectItem value="name">{t("sortNameAsc")}</SelectItem>
          <SelectItem value="name-desc">{t("sortNameDesc")}</SelectItem>
          <SelectItem value="city">{t("sortCity")}</SelectItem>
          <SelectItem value="province">{t("sortProvince")}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={provinceParam || ALL_PROVINCES}
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

      <Select
        value={String(radiusParam)}
        onValueChange={(value) => {
          clearDebounce();
          const nextRadius =
            parseCampgroundRadiusKm(value) ?? DEFAULT_CAMPGROUND_RADIUS_KM;
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

      {hasFilters ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            clearDebounce();
            setSearch("");
            setGeoError(null);
            replaceQuery({
              q: "",
              sort: latestParamsRef.current.sort,
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
