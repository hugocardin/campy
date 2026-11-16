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
  anySiteFilterActive,
  parseCampgroundGeo,
  parseCampgroundSiteFilters,
  parseCampgroundSort,
  roundCampgroundCoord,
} from "@/lib/campground-search";
import {
  CampgroundQueryState,
  buildCampgroundSearchParams,
  clearedCampgroundQueryState,
  siteFiltersKey,
  withLatestCampgroundFilters,
} from "@/lib/campground-search-query";
import type { DrivewayType } from "@/lib/driveway-type";
import {
  ELECTRICITY_AMP_NONE,
  type ElectricityAmpFilterOption,
  normalizeElectricityAmpFilters,
} from "@/lib/electricity-amps";
import RigLengthUnitToggle from "@/components/rig-length/RigLengthUnitToggle";
import {
  convertRigLengthDisplay,
  formatRigLengthForDisplay,
  maxRigLengthInUnit,
  parseGuestRigLength,
  parseRigLengthUnit,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import type { StayKind } from "@/lib/stay-kind";
import { stayKindAllowsRigLength } from "@/lib/stay-kind";
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
const STAY_ANY = "__any__";
const DRIVEWAY_ANY = "__any__";

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

function queryStateFromFilters(
  base: Omit<
    CampgroundQueryState,
    | "amps"
    | "water"
    | "sewer"
    | "dumpStation"
    | "drivewayType"
    | "rigLength"
    | "rigUnit"
    | "stayKind"
  >,
  filters: ReturnType<typeof parseCampgroundSiteFilters>,
  rigUnit?: RigLengthUnit,
): CampgroundQueryState {
  return {
    ...base,
    amps: filters.amps,
    water: filters.water,
    sewer: filters.sewer,
    dumpStation: filters.dumpStation,
    drivewayType: filters.drivewayType,
    rigLength: filters.rigLength,
    rigUnit: rigUnit === "m" ? "m" : undefined,
    stayKind: filters.stayKind,
  };
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
  const urlFilters = parseCampgroundSiteFilters({
    amps: searchParams.get("amps") ?? undefined,
    electricity: searchParams.get("electricity") ?? undefined,
    water: searchParams.get("water") ?? undefined,
    sewer: searchParams.get("sewer") ?? undefined,
    dump: searchParams.get("dump") ?? undefined,
    driveway: searchParams.get("driveway") ?? undefined,
    rigLength: searchParams.get("rigLength") ?? undefined,
    stay: searchParams.get("stay") ?? undefined,
  });
  const urlRigUnit = parseRigLengthUnit(searchParams.get("rigUnit"));
  const urlFiltersKey = siteFiltersKey(urlFilters);
  // Include unit in external-nav sync key so back/forward restores the toggle.
  const urlRigSyncKey = `${urlFiltersKey}|${urlRigUnit}`;
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
  const [localFilters, setLocalFilters] = useState(urlFilters);
  const [rigUnit, setRigUnit] = useState<RigLengthUnit>(urlRigUnit);
  const [prevUrlRigSyncKey, setPrevUrlRigSyncKey] = useState(urlRigSyncKey);
  const [lastPushedFiltersKey, setLastPushedFiltersKey] =
    useState(urlFiltersKey);
  const [lastPushedRigUnit, setLastPushedRigUnit] =
    useState<RigLengthUnit>(urlRigUnit);
  const [rigDraft, setRigDraft] = useState(
    formatRigLengthForDisplay(urlFilters.rigLength, urlRigUnit),
  );
  // Ref so search debounce flush never reads a stale rigDraft closure.
  const rigDraftRef = useRef(rigDraft);
  const rigUnitRef = useRef(rigUnit);

  const debounceTimeoutRef = useRef<number | null>(null);
  const rigDebounceRef = useRef<number | null>(null);
  const geoRequestIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const latestParamsRef = useRef<CampgroundQueryState>(
    queryStateFromFilters(
      {
        q: search,
        sort: sortParam,
        province: provinceParam,
        lat: geo?.lat,
        lng: geo?.lng,
        radiusKm: geo?.radiusKm ?? preferredRadius,
      },
      localFilters,
      rigUnit,
    ),
  );

  // Sync search input from URL only for external changes (back/forward / Clear).
  // Ref writes for latestParams happen in an effect (react-hooks/refs).
  if (qParam !== prevQParam) {
    setPrevQParam(qParam);
    if (qParam !== lastPushedQ) {
      setLastPushedQ(qParam);
      if (search.trim() !== qParam) {
        setSearch(qParam);
      }
    }
  }

  // Sync filter *state* from URL only for external changes (not our pending push).
  // Always adopt URL filter values; only rewrite rigDraft on external navigations
  // so a mid-type draft ("40") is not clobbered by our own echo for "4".
  if (urlRigSyncKey !== prevUrlRigSyncKey) {
    setPrevUrlRigSyncKey(urlRigSyncKey);
    const isExternal =
      urlFiltersKey !== lastPushedFiltersKey || urlRigUnit !== lastPushedRigUnit;
    if (isExternal) {
      setLastPushedFiltersKey(urlFiltersKey);
      setLastPushedRigUnit(urlRigUnit);
      // setState only during render (react-hooks/refs); effects sync refs below.
      setRigUnit(urlRigUnit);
      setRigDraft(formatRigLengthForDisplay(urlFilters.rigLength, urlRigUnit));
    }
    setLocalFilters(urlFilters);
  }

  // Keep preferred radius in sync when geo URL changes (e.g. back/forward).
  if (geo?.radiusKm != null && geo.radiusKm !== prevGeoRadius) {
    setPrevGeoRadius(geo.radiusKm);
    setPreferredRadius(geo.radiusKm);
  } else if (geo?.radiusKm == null && prevGeoRadius != null) {
    setPrevGeoRadius(undefined);
  }

  useEffect(() => {
    latestParamsRef.current = queryStateFromFilters(
      {
        q: search,
        sort: sortParam,
        province: provinceParam,
        lat: geo?.lat,
        lng: geo?.lng,
        radiusKm: geo?.radiusKm ?? preferredRadius,
      },
      localFilters,
      rigUnit,
    );
  }, [
    search,
    sortParam,
    provinceParam,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    preferredRadius,
    localFilters,
    rigUnit,
  ]);

  // Sync refs after render-time setState (external URL sync). Event handlers
  // use updateRigDraft / updateRigUnit so the ref is current before the next paint.
  useEffect(() => {
    rigDraftRef.current = rigDraft;
  }, [rigDraft]);

  useEffect(() => {
    rigUnitRef.current = rigUnit;
  }, [rigUnit]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      geoRequestIdRef.current += 1;
    };
  }, []);

  function clearSearchDebounce() {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }

  function updateRigDraft(value: string) {
    rigDraftRef.current = value;
    setRigDraft(value);
  }

  function updateRigUnit(unit: RigLengthUnit) {
    rigUnitRef.current = unit;
    setRigUnit(unit);
  }

  /** Parse the live draft in the active unit → canonical feet. */
  function resolveRigDraft(): number | undefined {
    const draft = rigDraftRef.current;
    const parsed = parseGuestRigLength(draft, rigUnitRef.current);
    if (draft.trim() !== "" && parsed == null) {
      updateRigDraft("");
    }
    return parsed;
  }

  /**
   * Cancel a pending rig debounce and return the draft value (flush into next patch).
   * Always reads `rigDraftRef` so timers started on an older search render still see
   * the latest typed length.
   */
  function takePendingRigLength(): number | undefined {
    if (rigDebounceRef.current != null) {
      window.clearTimeout(rigDebounceRef.current);
      rigDebounceRef.current = null;
      return resolveRigDraft();
    }
    return latestParamsRef.current.rigLength;
  }

  function cancelGeolocation() {
    geoRequestIdRef.current += 1;
    setGeoBusy(false);
  }

  function replaceQuery(next: CampgroundQueryState) {
    const trimmedQ = next.q.trim();
    setLastPushedQ(trimmedQ);
    const nextKey = siteFiltersKey(next);
    const nextUnit: RigLengthUnit = next.rigUnit === "m" ? "m" : "ft";
    setLastPushedFiltersKey(nextKey);
    setLastPushedRigUnit(nextUnit);
    setLocalFilters({
      amps: next.amps,
      water: next.water,
      sewer: next.sewer,
      dumpStation: next.dumpStation,
      drivewayType: next.drivewayType,
      rigLength: next.rigLength,
      stayKind: next.stayKind,
    });
    updateRigUnit(nextUnit);
    // Do not overwrite mid-typing rigDraft here — external URL sync does that.
    if (!stayKindAllowsRigLength(next.stayKind)) {
      updateRigDraft("");
    }
    latestParamsRef.current = next;

    const params = buildCampgroundSearchParams(next);
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  function onRigUnitChange(nextUnit: RigLengthUnit) {
    const fromUnit = rigUnitRef.current;
    if (nextUnit === fromUnit) return;
    clearSearchDebounce();
    // Cancel pending rig debounce and flush the draft in the *current* unit
    // before flipping (avoids a stale timer re-parsing metres as a new feet value).
    const feet = takePendingRigLength();
    const draft = rigDraftRef.current.trim();
    const n = Number(draft);
    const converted =
      draft !== "" && Number.isFinite(n) && n > 0
        ? convertRigLengthDisplay(n, fromUnit, nextUnit)
        : undefined;
    updateRigUnit(nextUnit);
    updateRigDraft(converted != null ? String(converted) : "");
    replaceQuery(
      withLatestCampgroundFilters(latestParamsRef.current, {
        q: latestParamsRef.current.q,
        sort: latestParamsRef.current.sort,
        rigLength: feet,
        rigUnit: nextUnit === "m" ? "m" : undefined,
      }),
    );
  }

  /** Apply a filter patch; flush any pending rig draft so it is not dropped. */
  function replaceWithFilters(
    patch: Parameters<typeof withLatestCampgroundFilters>[1],
  ) {
    clearSearchDebounce();
    const rigLength = takePendingRigLength();
    replaceQuery(
      withLatestCampgroundFilters(latestParamsRef.current, {
        ...patch,
        q: patch.q ?? latestParamsRef.current.q,
        sort: patch.sort ?? latestParamsRef.current.sort,
        // Flush only when camping stays allowed; lodging clears via withLatest.
        ...("rigLength" in patch ? {} : { rigLength }),
      }),
    );
  }

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === qParam || trimmed === lastPushedQ) return;

    clearSearchDebounce();
    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      const latest = latestParamsRef.current;
      const rigLength = takePendingRigLength();
      replaceQuery({
        ...latest,
        q: search,
        rigLength: stayKindAllowsRigLength(latest.stayKind)
          ? rigLength
          : undefined,
      });
    }, 300);

    return clearSearchDebounce;
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
        replaceWithFilters({
          q: latestParamsRef.current.q,
          sort: "distance",
          lat: roundCampgroundCoord(pos.coords.latitude),
          lng: roundCampgroundCoord(pos.coords.longitude),
          radiusKm:
            latestParamsRef.current.radiusKm ?? preferredRadius,
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
      anySiteFilterActive(localFilters),
  );
  // Discrete controls only — keep the search input enabled during isPending so
  // typing is not blurred/lost while router.replace transitions.
  const discreteControlsDisabled = geoBusy || isPending;
  const selectedAmps = new Set(localFilters.amps);
  // Rig + driveway are camping/RV site attributes (hidden for lodging searches).
  const showCampingSiteAttrs = stayKindAllowsRigLength(localFilters.stayKind);

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
            replaceWithFilters({
              q: search,
              sort: parseCampgroundSort(value, { geoActive: Boolean(geo) }),
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
          disabled={discreteControlsDisabled}
          onValueChange={(value) => {
            replaceWithFilters({
              q: search,
              sort: latestParamsRef.current.sort,
              province: value === ALL_PROVINCES ? "" : value,
            });
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

        <Select
          value={localFilters.stayKind ?? STAY_ANY}
          disabled={discreteControlsDisabled}
          onValueChange={(value) => {
            const stayKind: StayKind | undefined =
              value === STAY_ANY ? undefined : (value as StayKind);
            replaceWithFilters({
              q: search,
              sort: latestParamsRef.current.sort,
              stayKind,
            });
          }}
        >
          <SelectTrigger className="w-44" aria-label={t("stayKindLabel")}>
            <SelectValue placeholder={t("stayKindLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STAY_ANY}>{t("stayKindAny")}</SelectItem>
            <SelectItem value="camping">{t("stayKindCamping")}</SelectItem>
            <SelectItem value="lodging">{t("stayKindLodging")}</SelectItem>
          </SelectContent>
        </Select>

        {geo ? (
          <Select
            value={String(geo.radiusKm)}
            disabled={discreteControlsDisabled}
            onValueChange={(value) => {
              const nextRadius = (CAMPGROUND_RADIUS_KM_PRESETS as readonly number[]).includes(
                Number(value),
              )
                ? (Number(value) as CampgroundRadiusKm)
                : DEFAULT_CAMPGROUND_RADIUS_KM;
              setPreferredRadius(nextRadius);
              replaceWithFilters({
                q: search,
                sort: latestParamsRef.current.sort,
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
              clearSearchDebounce();
              if (rigDebounceRef.current != null) {
                window.clearTimeout(rigDebounceRef.current);
                rigDebounceRef.current = null;
              }
              cancelGeolocation();
              setSearch("");
              updateRigDraft("");
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

      <div
        className="space-y-3"
        role="group"
        aria-labelledby="site-filters-label"
        aria-describedby="site-filters-hint"
      >
        <p
          id="site-filters-label"
          className="text-sm font-medium text-foreground"
        >
          {t("siteFiltersLabel")}
        </p>
        <fieldset
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0 m-0"
          disabled={discreteControlsDisabled}
        >
          <legend className="text-sm font-medium text-muted-foreground mr-1 float-left">
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
                    replaceWithFilters({
                      q: search,
                      sort: latestParamsRef.current.sort,
                      amps: toggleAmpFilter(
                        latestParamsRef.current.amps,
                        value,
                        checked === true,
                      ),
                    });
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
          <legend className="text-sm font-medium text-muted-foreground mr-1 float-left">
            {t("waterSewerLabel")}
          </legend>
          {HOOKUP_AMENITY_FILTERS.map(({ key, labelKey }) => {
            const id = `hookup-${key}`;
            return (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={localFilters[key]}
                  disabled={discreteControlsDisabled}
                  onCheckedChange={(checked) => {
                    replaceWithFilters({
                      q: search,
                      sort: latestParamsRef.current.sort,
                      [key]: checked === true,
                    });
                  }}
                />
                <Label htmlFor={id} className="font-normal cursor-pointer">
                  {t(labelKey)}
                </Label>
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          {showCampingSiteAttrs ? (
          <div>
            <Label
              htmlFor="driveway-filter"
              className="text-sm font-medium text-muted-foreground"
            >
              {t("drivewayLabel")}
            </Label>
            <Select
              value={localFilters.drivewayType ?? DRIVEWAY_ANY}
              disabled={discreteControlsDisabled}
              onValueChange={(value) => {
                const drivewayType: DrivewayType | undefined =
                  value === DRIVEWAY_ANY
                    ? undefined
                    : (value as DrivewayType);
                replaceWithFilters({
                  q: search,
                  sort: latestParamsRef.current.sort,
                  drivewayType,
                });
              }}
            >
              <SelectTrigger
                id="driveway-filter"
                className="w-48 mt-1.5"
                aria-label={t("drivewayLabel")}
              >
                <SelectValue placeholder={t("drivewayLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DRIVEWAY_ANY}>
                  {t("drivewayAny")}
                </SelectItem>
                <SelectItem value="PULL_THROUGH">
                  {t("drivewayPullThrough")}
                </SelectItem>
                <SelectItem value="BACK_IN">{t("drivewayBackIn")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          ) : null}

          {showCampingSiteAttrs ? (
            <div>
              <Label
                htmlFor="rig-length-filter"
                className="text-sm font-medium text-muted-foreground"
              >
                {t("rigLengthLabel")}
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="rig-length-filter"
                  type="number"
                  min={1}
                  max={maxRigLengthInUnit(rigUnit)}
                  step="any"
                  inputMode="decimal"
                  className="w-28"
                  placeholder={
                    rigUnit === "m"
                      ? t("rigLengthPlaceholderM")
                      : t("rigLengthPlaceholderFt")
                  }
                  value={rigDraft}
                  disabled={geoBusy}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateRigDraft(value);
                    if (rigDebounceRef.current != null) {
                      window.clearTimeout(rigDebounceRef.current);
                    }
                    rigDebounceRef.current = window.setTimeout(() => {
                      rigDebounceRef.current = null;
                      replaceQuery(
                        withLatestCampgroundFilters(latestParamsRef.current, {
                          q: latestParamsRef.current.q,
                          sort: latestParamsRef.current.sort,
                          rigLength: resolveRigDraft(),
                          rigUnit: rigUnitRef.current === "m" ? "m" : undefined,
                        }),
                      );
                    }, 300);
                  }}
                />
                <RigLengthUnitToggle
                  value={rigUnit}
                  onChange={onRigUnitChange}
                  disabled={geoBusy}
                  groupLabel={t("rigLengthUnitGroupLabel")}
                  ftLabel={t("rigLengthUnitFt")}
                  mLabel={t("rigLengthUnitM")}
                />
              </div>
            </div>
          ) : null}
        </div>
        <p id="site-filters-hint" className="text-xs text-muted-foreground">
          {t("siteFiltersHint")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="dump-station"
            checked={localFilters.dumpStation}
            disabled={discreteControlsDisabled}
            onCheckedChange={(checked) => {
              replaceWithFilters({
                q: search,
                sort: latestParamsRef.current.sort,
                dumpStation: checked === true,
              });
            }}
          />
          <Label htmlFor="dump-station" className="font-normal cursor-pointer">
            {t("filterDumpStation")}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground w-full sm:w-auto">
          {t("dumpStationHint")}
        </p>
      </div>

      {geoError ? (
        <p className="text-sm text-destructive" role="status">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
