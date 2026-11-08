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
  if (value && Object.hasOwn(CAMPGROUND_SORT_CONFIG, value)) {
    return value as CampgroundSort;
  }
  return "name";
}

/**
 * Sanitize a free-text search term for PostgREST `.or(...ilike...)`.
 * Strips filter-grammar breakers and PostgREST/ilike wildcards (`*`, `%`, `_`).
 * Keeps apostrophes and dots so terms like `St. John's` / `L'Anse` still match.
 * Accent-insensitive match (`unaccent`) is deferred to a later RPC.
 */
export function sanitizeCampgroundSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[%_*(),\"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
