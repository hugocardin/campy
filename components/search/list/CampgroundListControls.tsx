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
import SearchSuggestInput from "@/components/search/SearchSuggestInput";
import RigLengthInput from "@/components/rig-length/RigLengthInput";
import {
  CAMPGROUND_RADIUS_KM_PRESETS,
  CampgroundRadiusKm,
  type CampgroundSiteFilters,
  DEFAULT_CAMPGROUND_RADIUS_KM,
  HookupAmenityFilterKey,
  anySiteFilterActive,
  parseCampgroundGeo,
  parseCampgroundPlaceLabel,
  parseCampgroundSiteFilters,
  parseCampgroundSort,
  roundCampgroundCoord,
} from "@/lib/campground-search";
import {
  GUEST_MAX_PRICE_CAP,
  GUEST_PRICE_CURRENCIES,
  GUEST_PRICE_CURRENCY,
  formatGuestMaxPriceParam,
  parseGuestMaxPrice,
  parseGuestPriceCurrency,
} from "@/lib/campground-price";
import {
  CampgroundQueryState,
  buildCampgroundSearchParams,
  campgroundSearchParamsEqual,
  clearedCampgroundQueryState,
  siteFiltersFromQueryState,
  siteFiltersKey,
  withLatestCampgroundFilters,
} from "@/lib/campground-search-query";
import { createDebouncedNavigation } from "@/lib/debounced-navigation";
import type { DrivewayType } from "@/lib/driveway-type";
import {
  ELECTRICITY_AMP_NONE,
  type ElectricityAmpFilterOption,
  normalizeElectricityAmpFilters,
} from "@/lib/electricity-amps";
import type { SearchSuggestion } from "@/lib/geocoding/types";
import {
  amenityCodeCanonicalKey,
  normalizeGuestAmenityCodes,
} from "@/lib/guest-amenity-codes";
import {
  GUEST_SITE_TYPE_CODES,
  type GuestSiteTypeCode,
  campingSiteAttrsAllowed,
  normalizeGuestSiteTypes,
} from "@/lib/guest-site-types";
import { PASSWORD_MANAGER_IGNORE_PROPS } from "@/lib/password-manager-ignore";
import { routes } from "@/lib/routes";
import {
  convertRigDraftOnUnitChange,
  feetFromRigLengthUrlState,
  formatRigLengthForDisplay,
  guestRigLengthToUrlState,
  parseGuestRigLength,
  resolveGuestRigLengthState,
  resolveGuestRigLengthUnit,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import type { StayKind } from "@/lib/stay-kind";
import { translateCode } from "@/lib/translate-code";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LocateFixed } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";

function clearTimeoutRef(ref: MutableRefObject<number | null>) {
  if (ref.current != null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

export type GuestAmenityOption = {
  code: string;
};

type Props = {
  resultCount: number;
  /** Non-geo RPC hit the SQL LIMIT — hint to refine filters. */
  resultsTruncated?: boolean;
  provinces: string[];
  /** Admin amenity catalog minus water/sewer/dump/electricity (+ any URL-only codes). */
  amenityOptions?: GuestAmenityOption[];
  /**
   * Server-resolved unit for first paint / URL-absent case (issue #42 step 2).
   * Same rule as `detailQuery.rigUnit` on the home page — do not re-derive.
   */
  initialRigUnit: RigLengthUnit;
  /**
   * Signed-in preference used only to re-resolve when the URL omits `rigUnit`
   * (Clear / back to a preference-default URL).
   */
  preferredRigUnit?: RigLengthUnit | null;
  /**
   * Signed-in `profiles.default_rig_length` (feet), or null. Used when the URL
   * omits `rigLength` (issue #42 step 3).
   */
  defaultRigLength?: number | null;
  /**
   * Server-resolved feet for first paint (URL or profile default). Same rule
   * as the home page search RPC — do not re-derive on mount.
   */
  initialRigLength?: number;
};

const ALL_PROVINCES = "__all__";
const STAY_ANY = "__any__";
const DRIVEWAY_ANY = "__any__";

/** Debounce for free-text search / leave-place URL push. */
const SEARCH_INPUT_DEBOUNCE_MS = 300;
/**
 * Quiet period before starting a search navigation for discrete filter
 * clicks (multi-select checkboxes). Long enough to finish a multi-select
 * pass without a reload per click; short enough to feel intentional.
 */
const FILTER_NAV_DEBOUNCE_MS = 2500;

const AMP_FILTERS: {
  value: ElectricityAmpFilterOption;
  labelKey:
    | "filterAmpNone"
    | "filterAmp15"
    | "filterAmp30"
    | "filterAmp50";
}[] = [
  { value: ELECTRICITY_AMP_NONE, labelKey: "filterAmpNone" },
  { value: 15, labelKey: "filterAmp15" },
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

const SITE_TYPE_LABEL_KEYS: Record<
  GuestSiteTypeCode,
  "siteTypeTENT" | "siteTypeRV" | "siteTypeRV_AND_TENT" | "siteTypeLODGING"
> = {
  TENT: "siteTypeTENT",
  RV: "siteTypeRV",
  RV_AND_TENT: "siteTypeRV_AND_TENT",
  LODGING: "siteTypeLODGING",
};

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
    | "siteTypes"
    | "maxPrice"
    | "priceCurrency"
    | "amenityCodes"
  >,
  filters: ReturnType<typeof parseCampgroundSiteFilters>,
  rigUnit: RigLengthUnit | undefined,
  /** URL tri-state from {@link resolveGuestRigLengthState} / local pushes. */
  rigLengthUrlState: number | null | undefined,
): CampgroundQueryState {
  return {
    ...base,
    amps: filters.amps,
    water: filters.water,
    sewer: filters.sewer,
    dumpStation: filters.dumpStation,
    drivewayType: filters.drivewayType,
    rigLength: rigLengthUrlState,
    rigUnit,
    stayKind: filters.stayKind,
    siteTypes: filters.siteTypes,
    maxPrice: filters.maxPrice,
    priceCurrency: filters.priceCurrency,
    amenityCodes: filters.amenityCodes,
  };
}

function toggleSiteTypeFilter(
  current: GuestSiteTypeCode[],
  value: GuestSiteTypeCode,
  checked: boolean,
): GuestSiteTypeCode[] {
  const set = new Set(normalizeGuestSiteTypes(current));
  if (checked) set.add(value);
  else set.delete(value);
  return normalizeGuestSiteTypes([...set]);
}

function toggleAmenityFilter(
  current: string[],
  code: string,
  checked: boolean,
): string[] {
  const key = amenityCodeCanonicalKey(code);
  const set = new Set(normalizeGuestAmenityCodes(current));
  if (checked) set.add(key);
  else set.delete(key);
  return normalizeGuestAmenityCodes([...set]);
}

export default function CampgroundListControls({
  resultCount,
  resultsTruncated = false,
  provinces,
  amenityOptions = [],
  initialRigUnit,
  preferredRigUnit = null,
  defaultRigLength = null,
  initialRigLength,
}: Props) {
  const t = useTranslations("search.controls");
  const tAmenities = useTranslations("amenities");
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
  const placeParam = parseCampgroundPlaceLabel(
    searchParams.get("place") ?? undefined,
  );
  // Place label only meaningful with active geo.
  const placeLabel = geo ? placeParam : undefined;
  const urlFiltersParsed = parseCampgroundSiteFilters({
    amps: searchParams.get("amps") ?? undefined,
    electricity: searchParams.get("electricity") ?? undefined,
    water: searchParams.get("water") ?? undefined,
    sewer: searchParams.get("sewer") ?? undefined,
    dump: searchParams.get("dump") ?? undefined,
    driveway: searchParams.get("driveway") ?? undefined,
    rigLength: searchParams.get("rigLength") ?? undefined,
    stay: searchParams.get("stay") ?? undefined,
    types: searchParams.get("types") ?? undefined,
    maxPrice: searchParams.get("maxPrice") ?? undefined,
    currency: searchParams.get("currency") ?? undefined,
    amenities: searchParams.get("amenities") ?? undefined,
  });
  // Same precedence as the server (`resolveGuestRigLengthUnit` / State).
  const urlRigUnit = resolveGuestRigLengthUnit(
    searchParams.get("rigUnit"),
    preferredRigUnit,
    searchParams.has("rigUnit"),
  );
  const campingOk = campingSiteAttrsAllowed(
    urlFiltersParsed.stayKind,
    urlFiltersParsed.siteTypes,
  );
  const rigLengthParamPresent = searchParams.has("rigLength");
  const urlRigResolved = resolveGuestRigLengthState({
    raw: searchParams.get("rigLength"),
    present: rigLengthParamPresent,
    defaultFeet: defaultRigLength,
    campingOk,
  });
  const urlRigLength = urlRigResolved.feet;
  const urlRigLengthState = urlRigResolved.urlState;
  const urlFilters = {
    ...urlFiltersParsed,
    rigLength: urlRigLength,
  };
  const urlFiltersKey = siteFiltersKey(urlFilters);
  // Include unit + explicit-clear presence so back/forward restores toggle/length.
  const urlRigSyncKey = `${urlFiltersKey}|${urlRigUnit}|${
    rigLengthParamPresent ? "1" : "0"
  }`;
  const sortParam = parseCampgroundSort(
    searchParams.get("sort") ?? undefined,
    { geoActive: Boolean(geo) },
  );

  const [preferredRadius, setPreferredRadius] = useState<CampgroundRadiusKm>(
    geo?.radiusKm ?? DEFAULT_CAMPGROUND_RADIUS_KM,
  );
  const [prevGeoRadius, setPrevGeoRadius] = useState(geo?.radiusKm);
  // Input shows place label when a place centers the map; otherwise free-text q.
  const displayFromUrl = placeLabel ?? qParam;
  const [search, setSearch] = useState(displayFromUrl);
  const [prevDisplayFromUrl, setPrevDisplayFromUrl] = useState(displayFromUrl);
  const [lastPushedQ, setLastPushedQ] = useState(qParam);
  const [activePlace, setActivePlace] = useState<string | undefined>(placeLabel);
  const [prevPlaceLabel, setPrevPlaceLabel] = useState(placeLabel);
  const [localFilters, setLocalFilters] =
    useState<CampgroundSiteFilters>(urlFilters);
  const [rigUnit, setRigUnit] = useState<RigLengthUnit>(initialRigUnit);
  // Local URL tri-state — owned by replaceQuery / URL sync (not the effect).
  const [rigLengthUrlState, setRigLengthUrlState] = useState<
    number | null | undefined
  >(urlRigLengthState);
  const [prevUrlRigSyncKey, setPrevUrlRigSyncKey] = useState(urlRigSyncKey);
  const [lastPushedFiltersKey, setLastPushedFiltersKey] =
    useState(urlFiltersKey);
  const [lastPushedRigUnit, setLastPushedRigUnit] =
    useState<RigLengthUnit>(initialRigUnit);
  const [rigDraft, setRigDraft] = useState(
    formatRigLengthForDisplay(
      initialRigLength ?? urlRigLength,
      initialRigUnit,
    ),
  );
  const [maxPriceDraft, setMaxPriceDraft] = useState(
    formatGuestMaxPriceParam(urlFilters.maxPrice) ?? "",
  );
  // Ref so search debounce flush never reads a stale rigDraft closure.
  const rigDraftRef = useRef(rigDraft);
  const rigUnitRef = useRef(rigUnit);
  const maxPriceDraftRef = useRef(maxPriceDraft);

  const debounceTimeoutRef = useRef<number | null>(null);
  const rigDebounceRef = useRef<number | null>(null);
  const maxPriceDebounceRef = useRef<number | null>(null);
  /** True after editing away from a place label until the leave navigation lands. */
  const [leavePlacePending, setLeavePlacePending] = useState(false);
  /** Quiet-period hint while multi-select filter nav is debounced (results still stale). */
  const [filterNavPending, setFilterNavPending] = useState(false);
  const geoRequestIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const latestParamsRef = useRef<CampgroundQueryState>(
    queryStateFromFilters(
      {
        q: placeLabel ? "" : search,
        sort: sortParam,
        province: provinceParam,
        lat: geo?.lat,
        lng: geo?.lng,
        radiusKm: geo?.radiusKm ?? preferredRadius,
        place: placeLabel,
      },
      urlFilters,
      rigUnit,
      urlRigLengthState,
    ),
  );
  // Stable controller (lazy useState — navigate wired in layout effect below).
  const [filterNav] = useState(() =>
    createDebouncedNavigation<CampgroundQueryState>({
      debounceMs: FILTER_NAV_DEBOUNCE_MS,
      onPendingChange: setFilterNavPending,
    }),
  );
  /**
   * External URL adoption signal. Epoch-only: do not put `searchParams` in the
   * cancel effect deps (that re-cancelled on every own push after the first Back).
   */
  const [externalUrlSignal, setExternalUrlSignal] = useState<{
    epoch: number;
    query: string;
  }>({ epoch: 0, query: "" });
  /** Last query we actually pushed (or adopted from external URL) — for no-op skips. */
  const lastReplacedParamsRef = useRef(
    new URLSearchParams(searchParams.toString()),
  );
  // Live search text for navigate-time merge (avoid freezing q while holding).
  const searchRef = useRef(search);
  /** Place-centered search: keep q empty so RPC does not also ILIKE the label. */
  function liveSearchQ(place: string | undefined): string {
    return place ? "" : searchRef.current;
  }

  // Wire navigate outside render (react-hooks/refs).
  useLayoutEffect(() => {
    filterNav.setNavigate((state) => {
      // Hold URL-derived fields from `state`, but always take live free-text q
      // so typing during a quiet/in-flight window is not dropped.
      const next: CampgroundQueryState = {
        ...state,
        // Place-centered: empty q (same rule as liveSearchQ).
        q: state.place ? "" : searchRef.current,
      };
      latestParamsRef.current = next;
      // Match lastPushedQ to what we actually push (not the pre-merge scheduled q).
      setLastPushedQ(next.q.trim());
      const params = buildCampgroundSearchParams(next);
      // Skip when equal to the last push (or external URL we adopted) — not the
      // possibly-stale in-flight `searchParams` during isPending.
      if (campgroundSearchParamsEqual(params, lastReplacedParamsRef.current)) {
        return;
      }
      lastReplacedParamsRef.current = new URLSearchParams(params.toString());
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname);
      });
    });
  }, [filterNav, pathname, router, startTransition]);

  // Sync search input from URL only for external changes (back/forward / Clear).
  if (displayFromUrl !== prevDisplayFromUrl) {
    setPrevDisplayFromUrl(displayFromUrl);
    const externalQ = qParam !== lastPushedQ;
    const externalPlace = placeLabel !== prevPlaceLabel;
    if (externalQ || externalPlace) {
      setExternalUrlSignal((prev) => ({
        epoch: prev.epoch + 1,
        query: searchParams.toString(),
      }));
      setLastPushedQ(qParam);
      setPrevPlaceLabel(placeLabel);
      setActivePlace(placeLabel);
      // URL owns navigation — drop a stale leave-place push (setState-during-render).
      setLeavePlacePending(false);
      if (search !== displayFromUrl) {
        setSearch(displayFromUrl);
      }
    } else {
      setPrevPlaceLabel(placeLabel);
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
      setExternalUrlSignal((prev) => ({
        epoch: prev.epoch + 1,
        query: searchParams.toString(),
      }));
      setLastPushedFiltersKey(urlFiltersKey);
      setLastPushedRigUnit(urlRigUnit);
      // setState only during render (react-hooks/refs); effects sync refs below.
      setRigUnit(urlRigUnit);
      setRigLengthUrlState(urlRigLengthState);
      setRigDraft(formatRigLengthForDisplay(urlRigLength, urlRigUnit));
      setMaxPriceDraft(formatGuestMaxPriceParam(urlFilters.maxPrice) ?? "");
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
    const liveQ = activePlace ? "" : search;
    // Hold URL-derived fields until the URL catches up — but keep free-text q live
    // so a checkbox click cannot drop mid-typing search text.
    if (filterNavPending || isPending) {
      latestParamsRef.current = { ...latestParamsRef.current, q: liveQ };
      return;
    }
    // Build from local state only — do not re-seed from URL here (avoids a race
    // where a pending clear is overwritten before router.replace lands).
    latestParamsRef.current = queryStateFromFilters(
      {
        // Place-centered search: keep q empty so RPC does not also ILIKE the label.
        q: liveQ,
        sort: sortParam,
        province: provinceParam,
        lat: geo?.lat,
        lng: geo?.lng,
        radiusKm: geo?.radiusKm ?? preferredRadius,
        place: activePlace,
      },
      localFilters,
      rigUnit,
      rigLengthUrlState,
    );
  }, [
    search,
    activePlace,
    sortParam,
    provinceParam,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    preferredRadius,
    localFilters,
    rigUnit,
    rigLengthUrlState,
    filterNavPending,
    isPending,
  ]);

  // Cancel pending debounced pushes after external URL sync (back/forward).
  // Layout effect keyed only on the epoch signal — not live searchParams — so our
  // own pushes landing do not cancel a filter/search debounce armed mid-flight.
  useLayoutEffect(() => {
    if (externalUrlSignal.epoch === 0) return;
    clearTimeoutRef(debounceTimeoutRef);
    filterNav.cancel();
    lastReplacedParamsRef.current = new URLSearchParams(externalUrlSignal.query);
  }, [externalUrlSignal, filterNav]);

  // Sync refs after render-time setState (external URL sync). Event handlers
  // use updateRigDraft / updateRigUnit so the ref is current before the next paint.
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    rigDraftRef.current = rigDraft;
  }, [rigDraft]);

  useEffect(() => {
    rigUnitRef.current = rigUnit;
  }, [rigUnit]);

  useEffect(() => {
    maxPriceDraftRef.current = maxPriceDraft;
  }, [maxPriceDraft]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      geoRequestIdRef.current += 1;
      // Leaving the page: drop pending drafts/navigations (intentional).
      clearTimeoutRef(debounceTimeoutRef);
      clearTimeoutRef(rigDebounceRef);
      clearTimeoutRef(maxPriceDebounceRef);
      filterNav.cancel();
    };
  }, [filterNav]);

  function clearSearchDebounce() {
    clearTimeoutRef(debounceTimeoutRef);
  }

  /** Pending debounced target if any, else the live params ref. */
  function currentQueryBase(): CampgroundQueryState {
    return filterNav.peekPending() ?? latestParamsRef.current;
  }

  /** Clear geo + remap distance sort when finishing a leave-place navigation. */
  function leavePlaceUrlPatch(
    latest: CampgroundQueryState,
  ): Partial<CampgroundQueryState> & Pick<CampgroundQueryState, "sort"> {
    return {
      place: undefined,
      lat: undefined,
      lng: undefined,
      radiusKm: undefined,
      sort: latest.sort === "distance" ? "name" : latest.sort,
    };
  }

  function updateRigDraft(value: string) {
    rigDraftRef.current = value;
    setRigDraft(value);
  }

  function updateRigUnit(unit: RigLengthUnit) {
    rigUnitRef.current = unit;
    setRigUnit(unit);
  }

  /**
   * Parse the live draft → URL tri-state via {@link guestRigLengthToUrlState}
   * (empty → clear when a default exists; equals default → omit).
   */
  function resolveRigDraft(): number | null | undefined {
    const draft = rigDraftRef.current;
    if (draft.trim() === "") {
      return guestRigLengthToUrlState(null, defaultRigLength);
    }
    const parsed = parseGuestRigLength(draft, rigUnitRef.current);
    if (parsed == null) {
      updateRigDraft("");
      return guestRigLengthToUrlState(null, defaultRigLength);
    }
    return guestRigLengthToUrlState(parsed, defaultRigLength);
  }

  /**
   * Cancel a pending rig debounce and return the draft value (flush into next patch).
   * Always reads `rigDraftRef` so timers started on an older search render still see
   * the latest typed length.
   */
  function takePendingRigLength(): number | null | undefined {
    if (rigDebounceRef.current != null) {
      clearTimeoutRef(rigDebounceRef);
      return resolveRigDraft();
    }
    return latestParamsRef.current.rigLength;
  }

  function updateMaxPriceDraft(value: string) {
    maxPriceDraftRef.current = value;
    setMaxPriceDraft(value);
  }

  function resolveMaxPriceDraft(): number | undefined {
    const draft = maxPriceDraftRef.current.trim();
    if (draft === "") return undefined;
    // Keep invalid mid-typing drafts in the field; only apply when parseable.
    return parseGuestMaxPrice(draft);
  }

  function takePendingMaxPrice(): number | undefined {
    if (maxPriceDebounceRef.current != null) {
      clearTimeoutRef(maxPriceDebounceRef);
      return resolveMaxPriceDraft();
    }
    return latestParamsRef.current.maxPrice;
  }

  function cancelGeolocation() {
    geoRequestIdRef.current += 1;
    setGeoBusy(false);
  }

  /**
   * Apply filter/search state locally and push the URL (search). Pass
   * `{ debounce: true }` for multi-select checkbox groups so rapid toggles
   * coalesce; the scheduled target is held by `filterNav` so URL-sync effects
   * cannot clobber sort/province/geo before the quiet period ends.
   */
  function replaceQuery(
    next: CampgroundQueryState,
    options?: { debounce?: boolean },
  ) {
    // Normalize place-mode q before tracking / scheduling (matches navigate).
    const normalized: CampgroundQueryState = {
      ...next,
      q: next.place ? "" : next.q,
    };
    const trimmedQ = normalized.q.trim();
    setLastPushedQ(trimmedQ);
    setActivePlace(normalized.place);
    setPrevPlaceLabel(normalized.place);
    const nextUnit: RigLengthUnit = normalized.rigUnit === "m" ? "m" : "ft";
    const campingAttrsOk = campingSiteAttrsAllowed(
      normalized.stayKind,
      normalized.siteTypes,
    );
    // URL state (omit / null / number) vs resolved feet for localFilters /
    // lastPushed key — must match what URL sync will resolve after replace,
    // or our own echo is treated as external and clobbers mid-type drafts.
    const resolvedFeet = feetFromRigLengthUrlState(
      normalized.rigLength,
      defaultRigLength,
      campingAttrsOk,
    );
    const filtersForKey = {
      ...siteFiltersFromQueryState(normalized),
      rigLength: resolvedFeet,
    };
    const nextKey = siteFiltersKey(filtersForKey);
    setLastPushedFiltersKey(nextKey);
    setLastPushedRigUnit(nextUnit);
    setLocalFilters(filtersForKey);
    setRigLengthUrlState(normalized.rigLength);
    updateRigUnit(nextUnit);
    // Do not overwrite mid-typing drafts here — external URL sync does that.
    if (!campingAttrsOk) {
      updateRigDraft("");
    }
    latestParamsRef.current = normalized;

    if (options?.debounce) {
      filterNav.schedule(normalized);
      return;
    }
    filterNav.flushNow(normalized);
  }

  function onSearchInputChange(nextValue: string) {
    searchRef.current = nextValue;
    setSearch(nextValue);
    // Leaving place mode: clear local place flag only. The sync effect rebuilds
    // latestParamsRef from the still-geo URL, so geo/sort are fixed in the
    // debounced replaceQuery below (single navigation; no catalog flash).
    if (activePlace && nextValue !== activePlace) {
      setActivePlace(undefined);
      setLeavePlacePending(true);
    }
  }

  function onSelectPlace(
    place: Extract<SearchSuggestion, { kind: "place" }>,
  ) {
    clearSearchDebounce();
    filterNav.cancel();
    setLeavePlacePending(false);
    const label = place.subtitle
      ? `${place.label}, ${place.subtitle}`
      : place.label;
    searchRef.current = label;
    setSearch(label);
    setGeoError(null);
    const latest = currentQueryBase();
    const radiusKm = latest.radiusKm ?? preferredRadius;
    replaceQuery(
      withLatestCampgroundFilters(latest, {
        q: "",
        sort: "distance",
        place: label,
        lat: roundCampgroundCoord(place.lat),
        lng: roundCampgroundCoord(place.lng),
        radiusKm,
      }),
    );
  }

  function onSelectCampground(
    campground: Extract<SearchSuggestion, { kind: "campground" }>,
  ) {
    clearSearchDebounce();
    filterNav.cancel();
    setLeavePlacePending(false);
    startTransition(() => {
      router.push(
        routes.campgroundDetail(campground.id, {
          rigUnit: rigUnitRef.current,
        }),
      );
    });
  }

  function onRigUnitChange(nextUnit: RigLengthUnit) {
    const fromUnit = rigUnitRef.current;
    if (nextUnit === fromUnit) return;
    clearSearchDebounce();
    // Cancel pending rig debounce and flush the draft in the *current* unit
    // before flipping (avoids a stale timer re-parsing metres as a new feet value).
    const feet = takePendingRigLength();
    const converted = convertRigDraftOnUnitChange(
      rigDraftRef.current,
      fromUnit,
      nextUnit,
      locale,
    );
    updateRigUnit(nextUnit);
    updateRigDraft(converted);
    const latest = currentQueryBase();
    const leavePatch = leavePlacePending
      ? leavePlaceUrlPatch(latest)
      : undefined;
    if (leavePlacePending) setLeavePlacePending(false);
    // leavePlaceUrlPatch sets place: undefined — must not fall back via ??.
    const placeAfter = leavePatch ? leavePatch.place : latest.place;
    replaceQuery(
      withLatestCampgroundFilters(latest, {
        ...leavePatch,
        q: liveSearchQ(placeAfter),
        sort: leavePatch?.sort ?? latest.sort,
        rigLength: feet,
        rigUnit: nextUnit,
      }),
    );
  }

  /**
   * Apply a filter patch; flush pending rig / max-price drafts so they are not
   * dropped. Pass `{ debounce: true }` for multi-select checkboxes only —
   * single-choice selects stay immediate (URL-controlled displays must not
   * snap back during a quiet period).
   */
  function replaceWithFilters(
    patch: Parameters<typeof withLatestCampgroundFilters>[1],
    options?: { debounce?: boolean },
  ) {
    clearSearchDebounce();
    // Prefer a pending debounced target so a second checkbox click during the
    // quiet period builds on leave-place / prior toggles, not URL-rebuilt state.
    const latest = currentQueryBase();
    const patchSetsGeo = "lat" in patch || "lng" in patch;
    // Finish leave-place in the same navigation unless the patch sets its own geo
    // (e.g. near-me). Never keep old place radius after the user left the label.
    const leavePatch =
      leavePlacePending && !patchSetsGeo
        ? leavePlaceUrlPatch(latest)
        : undefined;
    if (leavePlacePending) setLeavePlacePending(false);
    const rigLength = takePendingRigLength();
    const maxPrice = takePendingMaxPrice();
    const placeAfter =
      leavePatch && "place" in leavePatch
        ? leavePatch.place
        : "place" in patch
          ? patch.place
          : latest.place;
    replaceQuery(
      withLatestCampgroundFilters(latest, {
        ...leavePatch,
        ...patch,
        // Prefer explicit patch.q, else live search text (not a frozen pending q).
        q: patch.q ?? liveSearchQ(placeAfter),
        sort: patch.sort ?? leavePatch?.sort ?? latest.sort,
        // Flush only when camping stays allowed; lodging clears via withLatest.
        ...("rigLength" in patch ? {} : { rigLength }),
        ...("maxPrice" in patch ? {} : { maxPrice }),
      }),
      options?.debounce ? { debounce: true } : undefined,
    );
  }

  useEffect(() => {
    // Place mode owns the URL via lat/lng/place — do not debounce q.
    if (activePlace) return;
    const trimmed = search.trim();
    // When leaving place mode, always push once (even if q stays empty) so geo
    // clears in the same navigation as the typed text.
    if (
      !leavePlacePending &&
      (trimmed === qParam || trimmed === lastPushedQ)
    ) {
      return;
    }

    clearSearchDebounce();
    const leavingPlace = leavePlacePending;
    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      setLeavePlacePending(false);
      const latest = currentQueryBase();
      const rigLength = takePendingRigLength();
      const maxPrice = takePendingMaxPrice();
      // Sync effect may have restored URL geo + distance sort into the ref;
      // when leaving place, clear those here in the same navigation as typed q.
      const leavePatch = leavingPlace ? leavePlaceUrlPatch(latest) : {};
      replaceQuery({
        ...latest,
        q: search,
        ...leavePatch,
        place: undefined,
        rigLength: campingSiteAttrsAllowed(latest.stayKind, latest.siteTypes)
          ? rigLength
          : undefined,
        maxPrice,
      });
    }, SEARCH_INPUT_DEBOUNCE_MS);

    return clearSearchDebounce;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on `search` / leavePlacePending
  }, [search, qParam, lastPushedQ, activePlace, leavePlacePending]);

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
        searchRef.current = "";
        setSearch("");
        replaceWithFilters({
          q: "",
          sort: "distance",
          place: undefined,
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
      placeLabel ||
      provinceParam ||
      geo ||
      anySiteFilterActive(localFilters),
  );
  // Disable discrete controls during isPending so a late URL echo cannot race a
  // mid-click localFilters update (render-time sync adopts URL when keys diverge).
  // Keep them enabled while only filterNavPending so multi-select can continue.
  // Search input stays enabled during isPending so typing is not blurred/lost.
  const discreteControlsDisabled = geoBusy || isPending;
  const selectedAmps = new Set(localFilters.amps);
  const selectedSiteTypes = new Set(localFilters.siteTypes);
  const selectedAmenityKeys = new Set(
    normalizeGuestAmenityCodes(localFilters.amenityCodes),
  );
  const sortedAmenityOptions = [...amenityOptions].sort((a, b) => {
    const la = translateCode(tAmenities, "codes", a.code);
    const lb = translateCode(tAmenities, "codes", b.code);
    return la.localeCompare(lb, locale, { sensitivity: "base" });
  });
  // Rig + driveway are camping/RV site attributes (hidden for lodging searches).
  const showCampingSiteAttrs = campingSiteAttrsAllowed(
    localFilters.stayKind,
    localFilters.siteTypes,
  );
  // Fine site-type checkboxes: hide LODGING when stay=camping and vice versa.
  const visibleSiteTypes = GUEST_SITE_TYPE_CODES.filter((code) => {
    if (localFilters.stayKind === "lodging") return code === "LODGING";
    if (localFilters.stayKind === "camping") return code !== "LODGING";
    return true;
  });

  return (
    // Password managers (e.g. Proton Pass) inject attrs like `data-protonpass-form`
    // onto this shell before hydration. suppressHydrationWarning only silences THIS
    // node's attributes. Keep its className/attrs derived from SSR-safe state only
    // (URL + server props), or remove the flag and re-check the console.
    <div
      className={`space-y-4 ${
        isPending || geoBusy || filterNavPending ? "opacity-80" : ""
      }`}
      suppressHydrationWarning
    >
      <div className="md:flex md:flex-wrap md:items-end md:gap-4 lg:gap-6 space-y-4 md:space-y-0">
        <SearchSuggestInput
          value={search}
          onChange={onSearchInputChange}
          onSelectPlace={onSelectPlace}
          onSelectCampground={onSelectCampground}
          disabled={geoBusy}
        />

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
            <SelectItem value="price">{t("sortPriceAsc")}</SelectItem>
            <SelectItem value="price-desc">{t("sortPriceDesc")}</SelectItem>
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
              filterNav.cancel();
              setLeavePlacePending(false);
              clearTimeoutRef(rigDebounceRef);
              clearTimeoutRef(maxPriceDebounceRef);
              cancelGeolocation();
              searchRef.current = "";
              setSearch("");
              setActivePlace(undefined);
              // Explicit clear when a profile default would otherwise reapply.
              updateRigDraft("");
              updateMaxPriceDraft("");
              setGeoError(null);
              replaceQuery({
                ...clearedCampgroundQueryState(),
                rigLength: guestRigLengthToUrlState(null, defaultRigLength),
              });
            }}
          >
            {t("clearFilters")}
          </Button>
        ) : null}

        <div className="text-sm text-muted-foreground md:ml-auto space-y-0.5">
          <p>{t("resultCount", { count: resultCount })}</p>
          {resultsTruncated ? (
            <p className="text-xs">{t("resultsTruncated")}</p>
          ) : null}
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
            {t("siteTypesLabel")}
          </legend>
          {visibleSiteTypes.map((code) => {
            const id = `site-type-${code}`;
            return (
              <div key={code} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selectedSiteTypes.has(code)}
                  disabled={discreteControlsDisabled}
                  onCheckedChange={(checked) => {
                    const latest = currentQueryBase();
                    replaceWithFilters(
                      {
                        q: search,
                        sort: latest.sort,
                        siteTypes: toggleSiteTypeFilter(
                          latest.siteTypes,
                          code,
                          checked === true,
                        ),
                      },
                      { debounce: true },
                    );
                  }}
                />
                <Label htmlFor={id} className="font-normal cursor-pointer">
                  {t(SITE_TYPE_LABEL_KEYS[code])}
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
                    const latest = currentQueryBase();
                    replaceWithFilters(
                      {
                        q: search,
                        sort: latest.sort,
                        amps: toggleAmpFilter(
                          latest.amps,
                          value,
                          checked === true,
                        ),
                      },
                      { debounce: true },
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
                    replaceWithFilters(
                      {
                        q: search,
                        sort: currentQueryBase().sort,
                        [key]: checked === true,
                      },
                      { debounce: true },
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
              <RigLengthInput
                id="rig-length-filter"
                className="mt-1.5"
                inputClassName="w-28"
                value={rigDraft}
                disabled={geoBusy}
                autoComplete="off"
                onChange={(value) => {
                  updateRigDraft(value);
                  clearTimeoutRef(rigDebounceRef);
                  rigDebounceRef.current = window.setTimeout(() => {
                    rigDebounceRef.current = null;
                    const latest = currentQueryBase();
                    replaceQuery(
                      withLatestCampgroundFilters(latest, {
                        q: liveSearchQ(latest.place),
                        sort: latest.sort,
                        rigLength: resolveRigDraft(),
                        rigUnit: rigUnitRef.current,
                      }),
                    );
                  }, SEARCH_INPUT_DEBOUNCE_MS);
                }}
                unit={rigUnit}
                onUnitChange={onRigUnitChange}
                groupLabel={t("rigLengthUnitGroupLabel")}
                placeholderFt={t("rigLengthPlaceholderFt")}
                placeholderM={t("rigLengthPlaceholderM")}
              />
            </div>
          ) : null}

          <div>
            <Label
              htmlFor="max-price-filter"
              className="text-sm font-medium text-muted-foreground"
            >
              {t("maxPriceLabel")}
            </Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="max-price-filter"
                type="number"
                min={1}
                max={GUEST_MAX_PRICE_CAP}
                step="any"
                inputMode="decimal"
                autoComplete="off"
                {...PASSWORD_MANAGER_IGNORE_PROPS}
                className="w-28"
                placeholder={t("maxPricePlaceholder")}
                value={maxPriceDraft}
                disabled={geoBusy}
                aria-describedby="max-price-hint"
                onChange={(e) => {
                  const value = e.target.value;
                  updateMaxPriceDraft(value);
                  clearTimeoutRef(maxPriceDebounceRef);
                  maxPriceDebounceRef.current = window.setTimeout(() => {
                    maxPriceDebounceRef.current = null;
                    const latest = currentQueryBase();
                    replaceQuery(
                      withLatestCampgroundFilters(latest, {
                        q: liveSearchQ(latest.place),
                        sort: latest.sort,
                        maxPrice: resolveMaxPriceDraft(),
                        priceCurrency:
                          latest.priceCurrency ?? GUEST_PRICE_CURRENCY,
                      }),
                    );
                  }, SEARCH_INPUT_DEBOUNCE_MS);
                }}
              />
              <Select
                value={urlFilters.priceCurrency ?? GUEST_PRICE_CURRENCY}
                disabled={geoBusy || discreteControlsDisabled}
                onValueChange={(value) => {
                  const priceCurrency =
                    parseGuestPriceCurrency(value) ?? GUEST_PRICE_CURRENCY;
                  replaceWithFilters({
                    q: search,
                    sort: latestParamsRef.current.sort,
                    maxPrice: resolveMaxPriceDraft(),
                    priceCurrency,
                  });
                }}
              >
                <SelectTrigger
                  className="w-24"
                  aria-label={t("priceCurrencyLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_PRICE_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p
              id="max-price-hint"
              className={
                urlFilters.maxPrice != null
                  ? "mt-1 text-xs text-muted-foreground"
                  : "sr-only"
              }
            >
              {urlFilters.maxPrice != null
                ? t("priceCurrencyScopeNote", {
                    currency:
                      urlFilters.priceCurrency ?? GUEST_PRICE_CURRENCY,
                  })
                : t("maxPriceHint")}
            </p>
          </div>
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
              replaceWithFilters(
                {
                  q: search,
                  sort: currentQueryBase().sort,
                  dumpStation: checked === true,
                },
                { debounce: true },
              );
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

      {amenityOptions.length > 0 ? (
        <div
          className="space-y-2"
          role="group"
          aria-labelledby="park-amenities-label"
          aria-describedby="park-amenities-hint"
        >
          <fieldset
            className="flex flex-wrap items-center gap-x-5 gap-y-2 border-0 p-0 m-0"
            disabled={discreteControlsDisabled}
          >
            <legend
              id="park-amenities-label"
              className="text-sm font-medium text-muted-foreground mr-1 float-left"
            >
              {t("amenitiesLabel")}
            </legend>
            {sortedAmenityOptions.map((opt) => {
              const key = amenityCodeCanonicalKey(opt.code);
              const id = `amenity-${key}`;
              return (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={selectedAmenityKeys.has(key)}
                    disabled={discreteControlsDisabled}
                    onCheckedChange={(checked) => {
                      const latest = currentQueryBase();
                      replaceWithFilters(
                        {
                          q: search,
                          sort: latest.sort,
                          amenityCodes: toggleAmenityFilter(
                            latest.amenityCodes,
                            opt.code,
                            checked === true,
                          ),
                        },
                        { debounce: true },
                      );
                    }}
                  />
                  <Label htmlFor={id} className="font-normal cursor-pointer">
                    {translateCode(tAmenities, "codes", opt.code)}
                  </Label>
                </div>
              );
            })}
          </fieldset>
          <p id="park-amenities-hint" className="text-xs text-muted-foreground">
            {t("amenitiesHint")}
          </p>
        </div>
      ) : null}

      {geoError ? (
        <p className="text-sm text-destructive" role="status">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
