import {
  CampgroundHookupFilters,
  CampgroundRadiusKm,
  CampgroundSiteFilters,
  CampgroundSort,
  campgroundSortQueryValue,
  formatCampgroundAmpsParam,
  validateCampgroundGeo,
} from "@/lib/campground-search";
import { provinceFilterKey } from "@/lib/canadian-provinces";
import { formatGuestMaxPriceParam } from "@/lib/campground-price";
import type { DrivewayType } from "@/lib/driveway-type";
import { formatDrivewayUrlParam } from "@/lib/driveway-type";
import type { ElectricityAmpFilterOption } from "@/lib/electricity-amps";
import { normalizeElectricityAmpFilters } from "@/lib/electricity-amps";
import {
  type GuestSiteTypeCode,
  campingSiteAttrsAllowed,
  formatGuestSiteTypesParam,
  siteTypesForStayKind,
} from "@/lib/guest-site-types";
import {
  formatGuestRigLengthParam,
  formatRigLengthUnitParam,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import type { StayKind } from "@/lib/stay-kind";
import { formatStayKindParam } from "@/lib/stay-kind";

export type CampgroundQueryState = {
  q: string;
  sort: CampgroundSort;
  province: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
  /**
   * Display label for a selected place (URL `place`). Not sent to text RPCs —
   * geo lat/lng/radiusKm drive the search. Cleared when the user edits the box.
   */
  place?: string;
  amps: ElectricityAmpFilterOption[];
  water: boolean;
  sewer: boolean;
  dumpStation: boolean;
  drivewayType?: DrivewayType;
  /** Canonical feet (matches URL `rigLength` / RPC). */
  rigLength?: number;
  /**
   * Display/input unit for the guest rig-length field.
   * URL: `rigUnit=m` when metres; omit for feet (default).
   */
  rigUnit?: RigLengthUnit;
  stayKind?: StayKind;
  /** Fine site types (URL `types`). */
  siteTypes: GuestSiteTypeCode[];
  /** Max nightly base price (URL `maxPrice`). */
  maxPrice?: number;
};

/** Merge a partial update onto the latest query state (hookups / geo / province). */
export function withLatestCampgroundFilters(
  latest: CampgroundQueryState,
  patch: Partial<CampgroundQueryState> & Pick<CampgroundQueryState, "q" | "sort">,
): CampgroundQueryState {
  const stayKind =
    "stayKind" in patch ? patch.stayKind : latest.stayKind;
  const siteTypesRaw =
    "siteTypes" in patch ? (patch.siteTypes ?? []) : latest.siteTypes;
  const siteTypes = siteTypesForStayKind(siteTypesRaw, stayKind);
  const campingOk = campingSiteAttrsAllowed(stayKind, siteTypes);
  const rigLengthRaw =
    "rigLength" in patch ? patch.rigLength : latest.rigLength;
  const rigUnitRaw = "rigUnit" in patch ? patch.rigUnit : latest.rigUnit;
  const drivewayRaw =
    "drivewayType" in patch ? patch.drivewayType : latest.drivewayType;
  const maxPriceRaw =
    "maxPrice" in patch ? patch.maxPrice : latest.maxPrice;
  return {
    q: patch.q,
    sort: patch.sort,
    province: patch.province ?? latest.province,
    lat: "lat" in patch ? patch.lat : latest.lat,
    lng: "lng" in patch ? patch.lng : latest.lng,
    radiusKm: "radiusKm" in patch ? patch.radiusKm : latest.radiusKm,
    place: "place" in patch ? patch.place : latest.place,
    amps: "amps" in patch ? (patch.amps ?? []) : latest.amps,
    water: patch.water ?? latest.water,
    sewer: patch.sewer ?? latest.sewer,
    dumpStation: patch.dumpStation ?? latest.dumpStation,
    stayKind,
    // Drop fine types incompatible with coarse stay (#24).
    siteTypes,
    // Drop rig + driveway when lodging stay or lodging-only fine types (#27/#40).
    drivewayType: campingOk ? drivewayRaw : undefined,
    rigLength: campingOk ? rigLengthRaw : undefined,
    // Keep unit preference through lodging so camping↔lodging restores the toggle
    // (also emitted in the URL — see buildCampgroundSearchParams).
    rigUnit: rigUnitRaw === "m" ? "m" : undefined,
    maxPrice: maxPriceRaw,
  };
}

export function hookupsFromQueryState(
  state: Pick<CampgroundQueryState, "amps" | "water" | "sewer">,
): CampgroundHookupFilters {
  return {
    amps: state.amps,
    water: state.water,
    sewer: state.sewer,
  };
}

export function siteFiltersFromQueryState(
  state: Pick<
    CampgroundQueryState,
    | "amps"
    | "water"
    | "sewer"
    | "dumpStation"
    | "drivewayType"
    | "rigLength"
    | "stayKind"
    | "siteTypes"
    | "maxPrice"
  >,
): CampgroundSiteFilters {
  const siteTypes = siteTypesForStayKind(state.siteTypes, state.stayKind);
  const campingOk = campingSiteAttrsAllowed(state.stayKind, siteTypes);
  return {
    amps: state.amps,
    water: state.water,
    sewer: state.sewer,
    dumpStation: state.dumpStation,
    drivewayType: campingOk ? state.drivewayType : undefined,
    rigLength: campingOk ? state.rigLength : undefined,
    stayKind: state.stayKind,
    siteTypes,
    maxPrice: state.maxPrice,
  };
}

export function hookupsKey(hookups: CampgroundHookupFilters): string {
  const amps = normalizeElectricityAmpFilters(hookups.amps).join(",");
  return [
    amps,
    hookups.water ? "1" : "0",
    hookups.sewer ? "1" : "0",
  ].join("|");
}

/** Stable key for optimistic site-filter sync (includes dump/driveway/rig/stay/types/price). */
export function siteFiltersKey(filters: CampgroundSiteFilters): string {
  return [
    hookupsKey(filters),
    filters.dumpStation ? "1" : "0",
    filters.drivewayType ?? "",
    filters.rigLength != null ? String(filters.rigLength) : "",
    filters.stayKind ?? "",
    formatGuestSiteTypesParam(filters.siteTypes) ?? "",
    formatGuestMaxPriceParam(filters.maxPrice) ?? "",
  ].join("|");
}

/** Build guest search URLSearchParams from query state (omit defaults / falsy). */
export function buildCampgroundSearchParams(
  next: CampgroundQueryState,
): URLSearchParams {
  const params = new URLSearchParams();
  const trimmedQ = next.q.trim();
  if (trimmedQ) {
    params.set("q", trimmedQ);
  }
  const geo = validateCampgroundGeo(next.lat, next.lng, next.radiusKm);
  const sortQuery = campgroundSortQueryValue(next.sort, Boolean(geo));
  if (sortQuery) {
    params.set("sort", sortQuery);
  }
  if (next.province) {
    params.set("province", provinceFilterKey(next.province) ?? next.province);
  }
  if (geo) {
    params.set("lat", String(geo.lat));
    params.set("lng", String(geo.lng));
    params.set("radiusKm", String(geo.radiusKm));
  }
  const placeLabel = next.place?.trim().slice(0, 120);
  // Only keep place label when geo is active (place without coords is meaningless).
  if (geo && placeLabel) {
    params.set("place", placeLabel);
  }
  const ampsParam = formatCampgroundAmpsParam(next.amps);
  if (ampsParam) params.set("amps", ampsParam);
  if (next.water) params.set("water", "1");
  if (next.sewer) params.set("sewer", "1");
  if (next.dumpStation) params.set("dump", "1");
  const stayParam = formatStayKindParam(next.stayKind);
  if (stayParam) params.set("stay", stayParam);
  if (campingSiteAttrsAllowed(next.stayKind, next.siteTypes)) {
    const drivewayParam = formatDrivewayUrlParam(next.drivewayType);
    if (drivewayParam) params.set("driveway", drivewayParam);
    const rigParam = formatGuestRigLengthParam(next.rigLength);
    if (rigParam) params.set("rigLength", rigParam);
  }
  // Persist unit preference whenever metres is selected (even with empty length
  // or lodging), so shared links / stay toggles restore the toggle. Omitted when
  // feet (default). Harmless for lodging — RPC ignores it.
  const unitParam = formatRigLengthUnitParam(next.rigUnit);
  if (unitParam) {
    params.set("rigUnit", unitParam);
  }
  const typesParam = formatGuestSiteTypesParam(
    siteTypesForStayKind(next.siteTypes, next.stayKind),
  );
  if (typesParam) params.set("types", typesParam);
  const maxPriceParam = formatGuestMaxPriceParam(next.maxPrice);
  if (maxPriceParam) params.set("maxPrice", maxPriceParam);
  return params;
}

/** Empty filters after Clear (non-geo name sort). */
export function clearedCampgroundQueryState(): CampgroundQueryState {
  return {
    q: "",
    sort: "name",
    province: "",
    place: undefined,
    amps: [],
    water: false,
    sewer: false,
    dumpStation: false,
    siteTypes: [],
  };
}

/**
 * Stable identity for empty-map live-region re-announcement.
 * Built from the same filter axes passed to `getCampgrounds` (not display-only
 * `place`). `sort` is excluded: reordering without changing the result set
 * should not re-announce “no results”.
 */
export function campgroundSearchKey(filters: {
  q?: string;
  province?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  siteFiltersKey?: string;
}): string {
  const geo =
    filters.lat != null && filters.lng != null && filters.radiusKm != null
      ? `${filters.lat},${filters.lng},${filters.radiusKm}`
      : "";
  return [
    filters.q ?? "",
    filters.province ?? "",
    geo,
    filters.siteFiltersKey ?? "",
  ].join("|");
}
