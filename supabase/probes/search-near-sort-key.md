# Probe: near RPC `sort_key` (#24 §4 distance/price polish)

Migration: `20261116162000_search_near_sort_key`

## Design

| Concern | Choice |
| --- | --- |
| Distance sort | Default `sort_key='distance'`; `ORDER BY distance_m, name, id` within radius |
| Price sort (geo) | `sort_key='price'\|'price-desc'`; min_price early when price-sorting; LIMIT after price order (not nearest-then-JS-re-sort) |
| Other sorts | `name` / `name-desc` / `city` / `province` also SQL-ordered; secondary by distance |
| Rating | Parked — no `reviews` table |

URL (unchanged): `lat`/`lng`/`radiusKm` + `sort=price` / omit for distance default.

## Live smoke

```sql
-- Vancouver-ish; adjust if seed coords differ
SELECT name, round(distance_m::numeric) AS distance_m, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28,
  lng := -123.12,
  radius_m := 500000,
  sort_key := 'distance',
  result_limit := 10
);

SELECT name, round(distance_m::numeric) AS distance_m, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28,
  lng := -123.12,
  radius_m := 500000,
  sort_key := 'price',
  result_limit := 10
);

SELECT name, min_price_per_night
FROM search_campgrounds_near(
  lat := 49.28,
  lng := -123.12,
  radius_m := 500000,
  sort_key := 'price-desc',
  result_limit := 10
);
```

Expect: distance order ≠ price order when parks differ; price ASC still starts at the cheapest park **inside** the radius (not the cheapest among only the N nearest).
