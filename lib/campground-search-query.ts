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
import type { DrivewayType } from "@/lib/driveway-type";
import { formatDrivewayUrlParam } from "@/lib/driveway-type";
import type { ElectricityAmpFilterOption } from "@/lib/electricity-amps";
import { normalizeElectricityAmpFilters } from "@/lib/electricity-amps";
import {
  formatGuestRigLengthParam,
  formatRigLengthUnitParam,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import type { StayKind } from "@/lib/stay-kind";
import { formatStayKindParam, stayKindAllowsRigLength } from "@/lib/stay-kind";

export type CampgroundQueryState = {
  q: string;
  sort: CampgroundSort;
  province: string;
  lat?: number;
  lng?: number;
  radiusKm?: CampgroundRadiusKm;
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
};

/** Merge a partial update onto the latest query state (hookups / geo / province). */
export function withLatestCampgroundFilters(
  latest: CampgroundQueryState,
  patch: Partial<CampgroundQueryState> & Pick<CampgroundQueryState, "q" | "sort">,
): CampgroundQueryState {
  const stayKind =
    "stayKind" in patch ? patch.stayKind : latest.stayKind;
  const campingOk = stayKindAllowsRigLength(stayKind);
  const rigLengthRaw =
    "rigLength" in patch ? patch.rigLength : latest.rigLength;
  const rigUnitRaw = "rigUnit" in patch ? patch.rigUnit : latest.rigUnit;
  const drivewayRaw =
    "drivewayType" in patch ? patch.drivewayType : latest.drivewayType;
  return {
    q: patch.q,
    sort: patch.sort,
    province: patch.province ?? latest.province,
    lat: "lat" in patch ? patch.lat : latest.lat,
    lng: "lng" in patch ? patch.lng : latest.lng,
    radiusKm: "radiusKm" in patch ? patch.radiusKm : latest.radiusKm,
    amps: "amps" in patch ? (patch.amps ?? []) : latest.amps,
    water: patch.water ?? latest.water,
    sewer: patch.sewer ?? latest.sewer,
    dumpStation: patch.dumpStation ?? latest.dumpStation,
    stayKind,
    // Drop rig + driveway when lodging (cabins; issue #27).
    drivewayType: campingOk ? drivewayRaw : undefined,
    rigLength: campingOk ? rigLengthRaw : undefined,
    // Keep unit preference even when lodging so toggling stay back restores it.
    rigUnit: rigUnitRaw === "m" ? "m" : undefined,
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
  >,
): CampgroundSiteFilters {
  const campingOk = stayKindAllowsRigLength(state.stayKind);
  return {
    amps: state.amps,
    water: state.water,
    sewer: state.sewer,
    dumpStation: state.dumpStation,
    drivewayType: campingOk ? state.drivewayType : undefined,
    rigLength: campingOk ? state.rigLength : undefined,
    stayKind: state.stayKind,
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

/** Stable key for optimistic site-filter sync (includes dump/driveway/rig/stay). */
export function siteFiltersKey(filters: CampgroundSiteFilters): string {
  return [
    hookupsKey(filters),
    filters.dumpStation ? "1" : "0",
    filters.drivewayType ?? "",
    filters.rigLength != null ? String(filters.rigLength) : "",
    filters.stayKind ?? "",
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
  const ampsParam = formatCampgroundAmpsParam(next.amps);
  if (ampsParam) params.set("amps", ampsParam);
  if (next.water) params.set("water", "1");
  if (next.sewer) params.set("sewer", "1");
  if (next.dumpStation) params.set("dump", "1");
  const drivewayParam = formatDrivewayUrlParam(next.drivewayType);
  if (drivewayParam) params.set("driveway", drivewayParam);
  const stayParam = formatStayKindParam(next.stayKind);
  if (stayParam) params.set("stay", stayParam);
  if (stayKindAllowsRigLength(next.stayKind)) {
    const rigParam = formatGuestRigLengthParam(next.rigLength);
    if (rigParam) params.set("rigLength", rigParam);
  }
  // Persist unit preference whenever metres is selected (even with empty length),
  // so shared links restore the toggle. Omitted when feet (default).
  const unitParam = formatRigLengthUnitParam(next.rigUnit);
  if (unitParam && stayKindAllowsRigLength(next.stayKind)) {
    params.set("rigUnit", unitParam);
  }
  return params;
}

/** Empty filters after Clear (non-geo name sort). */
export function clearedCampgroundQueryState(): CampgroundQueryState {
  return {
    q: "",
    sort: "name",
    province: "",
    amps: [],
    water: false,
    sewer: false,
    dumpStation: false,
  };
}
