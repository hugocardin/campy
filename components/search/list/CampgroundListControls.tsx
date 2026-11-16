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
  DEFAULT_CAMPGROUND_RADIUS_KM,
  HookupAmenityFilterKey,
  anyHookupFilterActive,
  parseCampgroundGeo,
  parseCampgroundHookups,
  parseCampgroundSort,
  roundCampgroundCoord,
} from "@/lib/campground-search";
import {
  CampgroundQueryState,
  buildCampgroundSearchParams,
  clearedCampgroundQueryState,
  hookupsKey,
  withLatestCampgroundFilters,
} from "@/lib/campground-search-query";
import {
  ELECTRICITY_AMP_NONE,
  type ElectricityAmpFilterOption,
  normalizeElectricityAmpFilters,
} from "@/lib/electricity-amps";
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

const AMP_FILTERS: {
  value: ElectricityAmpFilterOption;
  labelKey:
    | "filterAmpNone"
    | "filterAmp15"
    | "filterAmp20"
    | "filterAmp30"
    | "filterAmp50";
}[] = [
  { value: ELECTRICITY_AMP_NONE, labelKey: "filterAmpNone" },
  { value: 15, labelKey: "filterAmp15" },
  { value: 20, labelKey: "filterAmp20" },
  { value: 30, labelKey: "filterAmp30" },
  { value: 50, labelKey: "filterAmp50" },
];

const HOOKUP_AMENITY_FILTERS: {
  key: HookupAmenityFilterKey;
  labelKey: "filterWater" | "filterSewer";
}[] = [
  { key: "water", labelKey: "filterWater" },
  { key: "sewer", labelKey: "filterSewer" },
];

function toggleAmpFilter(
  current: ElectricityAmpFilterOption[],
  value: ElectricityAmpFilterOption,
  checked: boolean,
): ElectricityAmpFilterOption[] {
  const set = new Set(normalizeElectricityAmpFilters(current));
  if (checked) set.add(value);
  else set.delete(value);
  return normalizeElectricityAmpFilters([...set]);
}

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
  const urlHookups = parseCampgroundHookups({
    amps: searchParams.get("amps") ?? undefined,
    electricity: searchParams.get("electricity") ?? undefined,
    water: searchParams.get("water") ?? undefined,
    sewer: searchParams.get("sewer") ?? undefined,
  });
  const urlHookupsKey = hookupsKey(urlHookups);
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
  const [localHookups, setLocalHookups] = useState(urlHookups);
  const [prevUrlHookupsKey, setPrevUrlHookupsKey] = useState(urlHookupsKey);
  const [lastPushedHookupsKey, setLastPushedHookupsKey] =
    useState(urlHookupsKey);

  const debounceTimeoutRef = useRef<number | null>(null);
  const geoRequestIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const latestParamsRef = useRef<CampgroundQueryState>({
    q: search,
    sort: sortParam,
    province: provinceParam,
    lat: geo?.lat,
    lng: geo?.lng,
    radiusKm: geo?.radiusKm ?? preferredRadius,
    amps: localHookups.amps,
    water: localHookups.water,
    sewer: localHookups.sewer,
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

  // Sync hookup *state* from URL only for external changes (not our pending push).
  // Ref updates happen in an effect below (react-hooks/refs forbids ref writes in render).
  if (urlHookupsKey !== prevUrlHookupsKey) {
    setPrevUrlHookupsKey(urlHookupsKey);
    if (urlHookupsKey !== lastPushedHookupsKey) {
      setLastPushedHookupsKey(urlHookupsKey);
      setLocalHookups(urlHookups);
    } else {
      setLocalHookups(urlHookups);
    }
  }

  // Keep preferred radius in sync when geo URL changes (e.g. back/forward).
  if (geo?.radiusKm != null && geo.radiusKm !== prevGeoRadius) {
    setPrevGeoRadius(geo.radiusKm);
    setPreferredRadius(geo.radiusKm);
  } else if (geo?.radiusKm == null && prevGeoRadius != null) {
    setPrevGeoRadius(undefined);
  }

  // Keep latestParamsRef aligned with URL/search + local hookups. Hookup local
  // state is optimistic; this effect runs after render so pending toggles that
  // already updated the ref via replaceQuery are not clobbered by stale URL.
  useEffect(() => {
    latestParamsRef.current = {
      q: search,
      sort: sortParam,
      province: provinceParam,
      lat: geo?.lat,
      lng: geo?.lng,
      radiusKm: geo?.radiusKm ?? preferredRadius,
      amps: localHookups.amps,
      water: localHookups.water,
      sewer: localHookups.sewer,
    };
  }, [
    search,
    sortParam,
    provinceParam,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    preferredRadius,
    localHookups.amps,
    localHookups.water,
    localHookups.sewer,
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

  function replaceQuery(next: CampgroundQueryState) {
    const trimmedQ = next.q.trim();
    setLastPushedQ(trimmedQ);
    const nextHookupsKey = hookupsKey(next);
    setLastPushedHookupsKey(nextHookupsKey);
    setLocalHookups({
      amps: next.amps,
      water: next.water,
      sewer: next.sewer,
    });
    latestParamsRef.current = next;

    const params = buildCampgroundSearchParams(next);
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
      const latest = latestParamsRef.current;
      replaceQuery({
        ...latest,
        q: search,
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
          withLatestCampgroundFilters(latestParamsRef.current, {
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
    search ||
      provinceParam ||
      geo ||
      anyHookupFilterActive(localHookups),
  );
  // Discrete controls only — keep the search input enabled during isPending so
  // typing is not blurred/lost while router.replace transitions.
  const discreteControlsDisabled = geoBusy || isPending;
  const selectedAmps = new Set(localHookups.amps);

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
            disabled={geoBusy}
          />
        </div>

        <Select
          value={sortParam}
          disabled={discreteControlsDisabled}
          onValueChange={(value) => {
            clearDebounce();
            replaceQuery(
              withLatestCampgroundFilters(latestParamsRef.current, {
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
          disabled={discreteControlsDisabled}
          onValueChange={(value) => {
            clearDebounce();
            replaceQuery(
              withLatestCampgroundFilters(latestParamsRef.current, {
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
            disabled={discreteControlsDisabled}
            onValueChange={(value) => {
              clearDebounce();
              const nextRadius = (CAMPGROUND_RADIUS_KM_PRESETS as readonly number[]).includes(
                Number(value),
              )
                ? (Number(value) as CampgroundRadiusKm)
                : DEFAULT_CAMPGROUND_RADIUS_KM;
              setPreferredRadius(nextRadius);
              replaceQuery(
                withLatestCampgroundFilters(latestParamsRef.current, {
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
          disabled={discreteControlsDisabled}
          aria-label={t("nearMe")}
        >
          <LocateFixed className="h-4 w-4" />
          {geoBusy ? t("nearMeLocating") : t("nearMe")}
        </Button>

        {hasFilters || geoBusy ? (
          <Button
            type="button"
            variant="outline"
            disabled={discreteControlsDisabled}
            onClick={() => {
              clearDebounce();
              cancelGeolocation();
              setSearch("");
              setGeoError(null);
              replaceQuery(clearedCampgroundQueryState());
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
        disabled={discreteControlsDisabled}
      >
        <legend className="text-sm font-medium text-foreground mr-1 float-left">
          {t("electricityAmpsLabel")}
        </legend>
        {AMP_FILTERS.map(({ value, labelKey }) => {
          const id = `amp-${value}`;
          return (
            <div key={String(value)} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selectedAmps.has(value)}
                disabled={discreteControlsDisabled}
                onCheckedChange={(checked) => {
                  clearDebounce();
                  replaceQuery(
                    withLatestCampgroundFilters(latestParamsRef.current, {
                      q: search,
                      sort: latestParamsRef.current.sort,
                      amps: toggleAmpFilter(
                        latestParamsRef.current.amps,
                        value,
                        checked === true,
                      ),
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

      <fieldset
        className="flex flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0 m-0"
        disabled={discreteControlsDisabled}
      >
        <legend className="text-sm font-medium text-foreground mr-1 float-left">
          {t("hookupsLabel")}
        </legend>
        {HOOKUP_AMENITY_FILTERS.map(({ key, labelKey }) => {
          const id = `hookup-${key}`;
          return (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={localHookups[key]}
                disabled={discreteControlsDisabled}
                onCheckedChange={(checked) => {
                  clearDebounce();
                  replaceQuery(
                    withLatestCampgroundFilters(latestParamsRef.current, {
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
      <p className="text-xs text-muted-foreground">{t("hookupsHint")}</p>

      {geoError ? (
        <p className="text-sm text-destructive" role="status">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
