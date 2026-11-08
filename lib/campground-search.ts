export type CampgroundSort = "name" | "name-desc" | "city" | "province";

export type CampgroundListFilters = {
  q?: string;
  sort?: CampgroundSort;
  province?: string;
};

export const CAMPGROUND_SORT_CONFIG: Record<
  CampgroundSort,
  { column: "name" | "city" | "province"; ascending: boolean }
> = {
  name: { column: "name", ascending: true },
  "name-desc": { column: "name", ascending: false },
  city: { column: "city", ascending: true },
  province: { column: "province", ascending: true },
};

export function parseCampgroundSort(value: string | undefined): CampgroundSort {
  if (value && value in CAMPGROUND_SORT_CONFIG) {
    return value as CampgroundSort;
  }
  return "name";
}

/** Strip characters that break PostgREST `.or()` / `ilike` filter syntax. */
export function sanitizeCampgroundSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[%_,.()\"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
