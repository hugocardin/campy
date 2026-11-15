import {
  CampgroundHookupFilters,
  CampgroundRadiusKm,
  CampgroundSort,
  campgroundSortQueryValue,
  validateCampgroundGeo,
} from "@/lib/campground-search";
import { provinceFilterKey } from "@/lib/canadian-provinces";

export type CampgroundQueryState = {
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

/** Merge a partial update onto the latest query state (hookups / geo / province). */
export function withLatestCampgroundFilters(
  latest: CampgroundQueryState,
  patch: Partial<CampgroundQueryState> & Pick<CampgroundQueryState, "q" | "sort">,
): CampgroundQueryState {
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

export function hookupsFromQueryState(
  state: Pick<CampgroundQueryState, "electricity" | "water" | "sewer">,
): CampgroundHookupFilters {
  return {
    electricity: state.electricity,
    water: state.water,
    sewer: state.sewer,
  };
}

export function hookupsKey(hookups: CampgroundHookupFilters): string {
  return [
    hookups.electricity ? "1" : "0",
    hookups.water ? "1" : "0",
    hookups.sewer ? "1" : "0",
  ].join("");
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
  if (next.electricity) params.set("electricity", "1");
  if (next.water) params.set("water", "1");
  if (next.sewer) params.set("sewer", "1");
  return params;
}

/** Empty filters after Clear (non-geo name sort). */
export function clearedCampgroundQueryState(): CampgroundQueryState {
  return {
    q: "",
    sort: "name",
    province: "",
    electricity: false,
    water: false,
    sewer: false,
  };
}
