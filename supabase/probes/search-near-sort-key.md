# Probe: near RPC `sort_key` (#24 §4 distance/price polish)

Migrations:

- `20261116162000_search_near_sort_key`
- `20261116162530_search_near_sort_name_asc` (#48 review: explicit `name` ASC)

## Design

| Concern | Choice |
| --- | --- |
| Distance sort | Default `sort_key='distance'`; `ORDER BY distance_m, name, id` within radius |
| Price sort (geo) | `sort_key='price'\|'price-desc'`; min_price early when price-sorting; LIMIT after price order |
| Name / city / province | Explicit CASE branches (including `name` ASC); secondary by distance (intentional geo tie-break; list RPC uses name-only) |
| Rating | Parked — no `reviews` table |
| App sync | `CAMPGROUND_SORT_KEYS` in `lib/campground-search.ts` must match SQL whitelist |

URL (unchanged): `lat`/`lng`/`radiusKm` + `sort=` (omit for distance default; keep `sort=name` when geo + name).

## Perf note (known tradeoff)

With `price_sort`, `campground_matching_site_min_price(...)` runs once per park inside the radius **before** LIMIT (needed for correct price order). Cost grows with park density × radius (clamp ≤ 200 km). Fine at current catalog size; if slow later, prefer a single `LEFT JOIN LATERAL` / grouped `min()` over `sites` for the `base` ids instead of N function calls.

## Live smoke

```sql
-- Vancouver-ish: price / distance / name-desc / city / province smoke
SELECT name, round(distance_m::numeric) AS distance_m, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'distance', result_limit := 10
);

SELECT name, round(distance_m::numeric) AS distance_m, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'price', result_limit := 10
);

SELECT name, round(distance_m::numeric) AS distance_m, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'price-desc', result_limit := 10
);

SELECT name
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'name-desc', result_limit := 10
);

SELECT name, city
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'city', result_limit := 10
);

SELECT name, province
FROM search_campgrounds_near(
  lat := 49.28, lng := -123.12, radius_m := 500000,
  sort_key := 'province', result_limit := 10
);

-- name ASC regression (#48): origin where nearer ≠ alphabetically first.
-- Maple Ridge: distance → Gold Creek (~27 km), Alice (~73 km).
-- name ASC must return Alice then Gold Creek (would match distance if buggy).
SELECT name, round(distance_m::numeric) AS distance_m
FROM search_campgrounds_near(
  lat := 49.22, lng := -122.60, radius_m := 200000,
  sort_key := 'distance', result_limit := 10
);

SELECT name, round(distance_m::numeric) AS distance_m
FROM search_campgrounds_near(
  lat := 49.22, lng := -122.60, radius_m := 200000,
  sort_key := 'name', result_limit := 10
);
```

Expect:

- Vancouver: distance ≠ price order when parks differ; `name-desc` / city / province smoke only
- Maple Ridge `distance`: **Gold Creek then Alice**
- Maple Ridge `name`: **Alice then Gold Creek** (discriminating — Gold Creek is nearer)
