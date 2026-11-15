"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isCanadianProvinceCode,
  provinceFilterKey,
} from "@/lib/canadian-provinces";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  CampgroundRadiusKm,
  CampgroundSort,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  HookupFilterKey,
  anyHookupFilterActive,
  campgroundSortQueryValue,
  parseCampgroundGeo,
  parseCampgroundHookups,
  parseCampgroundSort,
  roundCampgroundCoord,
  validateCampgroundGeo,
} from "@/lib/campground-search";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LocateFixed, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Props = {
  resultCount: number;
  provinces: string[];
};

const ALL_PROVINCES = "__all__";

const HOOKUP_FILTERS: {
  key: HookupFilterKey;
  labelKey: "filterElectricity" | "filterWater" | "filterSewer";
}[] = [
  { key: "electricity", labelKey: "filterElectricity" },
  { key: "water", labelKey: "filterWater" },
  { key: "sewer", labelKey: "filterSewer" },
];

type QueryState = {
  q: string;
  sort: CampgroundSort;
  province: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
  electricity: boolean;
  water: boolean;
  sewer: boolean;
};

type LatestParams = Omit<QueryState, "q">;

export default function CampgroundListControls({
  resultCount,
  provinces,
}: Props) {
  const t = useTranslations("search.controls");
  const tProvinces = useTranslations("search.provinces");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const qParam = searchParams.get("q") ?? "";
  const provinceParamRaw = searchParams.get("province") ?? "";
  // Unknown / malicious ?province= → treat as All (do not surface as an option).
  const provinceParam = provinceFilterKey(provinceParamRaw) ?? "";
  const geo = parseCampgroundGeo({
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    radiusKm: searchParams.get("radiusKm") ?? undefined,
  });
  const hookups = parseCampgroundHookups({
    electricity: searchParams.get("electricity") ?? undefined,
    water: searchParams.get("water") ?? undefined,
    sewer: searchParams.get("sewer") ?? undefined,
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
    electricity: hookups.electricity,
    water: hookups.water,
    sewer: hookups.sewer,
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
      electricity: hookups.electricity,
      water: hookups.water,
      sewer: hookups.sewer,
    };
  }, [
    search,
    sortParam,
    provinceParam,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    preferredRadius,
    hookups.electricity,
    hookups.water,
    hookups.sewer,
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
      electricity: next.electricity,
      water: next.water,
      sewer: next.sewer,
    };

    const params = new URLSearchParams();
    if (trimmedQ) {
      params.set("q", trimmedQ);
    }
    const geo = validateCampgroundGeo(next.lat, next.lng, next.radiusKm);
    const sortQuery = campgroundSortQueryValue(next.sort, Boolean(geo));
    if (sortQuery) {
      params.set("sort", sortQuery);
    }
    if (next.province) {
      params.set(
        "province",
        provinceFilterKey(next.province) ?? next.province,
      );
    }
    if (geo) {
      params.set("lat", String(geo.lat));
      params.set("lng", String(geo.lng));
      params.set("radiusKm", String(geo.radiusKm));
    }
    if (next.electricity) params.set("electricity", "1");
    if (next.water) params.set("water", "1");
    if (next.sewer) params.set("sewer", "1");

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  function withLatestFilters(
    patch: Partial<QueryState> & Pick<QueryState, "q" | "sort">,
  ): QueryState {
    const latest = latestParamsRef.current;
    return {
      q: patch.q,
      sort: patch.sort,
      province: patch.province ?? latest.province,
      lat: "lat" in patch ? patch.lat : latest.lat,
      lng: "lng" in patch ? patch.lng : latest.lng,
      radiusKm: "radiusKm" in patch ? patch.radiusKm : latest.radiusKm,
      electricity: patch.electricity ?? latest.electricity,
      water: patch.water ?? latest.water,
      sewer: patch.sewer ?? latest.sewer,
    };
  }

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === qParam || trimmed === lastPushedQ) return;

    clearDebounce();
    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      const { sort, province, lat, lng, radiusKm, electricity, water, sewer } =
        latestParamsRef.current;
      replaceQuery({
        q: search,
        sort,
        province,
        lat,
        lng,
        radiusKm,
        electricity,
        water,
        sewer,
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
        replaceQuery(
          withLatestFilters({
            q: latestParamsRef.current.q,
            sort: "distance",
            lat: roundCampgroundCoord(pos.coords.latitude),
            lng: roundCampgroundCoord(pos.coords.longitude),
            radiusKm,
          }),
        );
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

  // Known code from URL/alias may not be in the distinct list yet (empty catalog
  // for that province); still show it. Never inject arbitrary unknown URL text.
  const provinceKeys =
    provinceParam &&
    isCanadianProvinceCode(provinceParam) &&
    !provinces.includes(provinceParam)
      ? [...provinces, provinceParam]
      : provinces;
  const provinceOptions = provinceKeys
    .map((key) => ({
      key,
      label: isCanadianProvinceCode(key) ? tProvinces(key) : key,
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, locale, { sensitivity: "base" }),
    );

  const hasFilters = Boolean(
    search || provinceParam || geo || anyHookupFilterActive(hookups),
  );
  const controlsDisabled = geoBusy;

  return (
    <div
      className={`space-y-4 ${isPending || geoBusy ? "opacity-80" : ""}`}
    >
      <div className="md:flex md:flex-wrap md:items-end md:gap-4 lg:gap-6 space-y-4 md:space-y-0">
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
            replaceQuery(
              withLatestFilters({
                q: search,
                sort: parseCampgroundSort(value, { geoActive: Boolean(geo) }),
              }),
            );
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
            replaceQuery(
              withLatestFilters({
                q: search,
                sort: latestParamsRef.current.sort,
                province: value === ALL_PROVINCES ? "" : value,
              }),
            );
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t("provinceLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROVINCES}>{t("provinceAll")}</SelectItem>
            {provinceOptions.map(({ key, label }) => (
              <SelectItem key={key} value={key}>
                {label}
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
              replaceQuery(
                withLatestFilters({
                  q: search,
                  sort: latestParamsRef.current.sort,
                  radiusKm: nextRadius,
                }),
              );
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
                electricity: false,
                water: false,
                sewer: false,
              });
            }}
          >
            {t("clearFilters")}
          </Button>
        ) : null}

        <div className="text-sm text-muted-foreground md:ml-auto">
          {t("resultCount", { count: resultCount })}
        </div>
      </div>

      <fieldset
        className="flex flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0 m-0"
        disabled={controlsDisabled}
      >
        <legend className="text-sm font-medium text-foreground mr-1">
          {t("hookupsLabel")}
        </legend>
        {HOOKUP_FILTERS.map(({ key, labelKey }) => {
          const id = `hookup-${key}`;
          return (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={hookups[key]}
                disabled={controlsDisabled}
                onCheckedChange={(checked) => {
                  clearDebounce();
                  replaceQuery(
                    withLatestFilters({
                      q: search,
                      sort: latestParamsRef.current.sort,
                      [key]: checked === true,
                    }),
                  );
                }}
              />
              <Label htmlFor={id} className="font-normal cursor-pointer">
                {t(labelKey)}
              </Label>
            </div>
          );
        })}
      </fieldset>

      {geoError ? (
        <p className="text-sm text-destructive" role="status">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
