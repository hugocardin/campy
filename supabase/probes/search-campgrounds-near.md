# Probe: `search_campgrounds_near`

Migrations:

- `20261115032643_search_campgrounds_near.sql` (initial; version matches live `schema_migrations`)
- `20261115033324_search_campgrounds_near_harden.sql` (explicit `RETURNS TABLE` + `distance_m`, clamp, LIMIT, ILIKE escape)
- `20261115033824_search_campgrounds_near_reject_nan.sql` (reject NaN/±Inf on radius; cap q before escape)

## SQL

```sql
-- Within ~100 km of downtown Vancouver — expect Squamish / Maple Ridge parks, nearest first
SELECT name, city, round(distance_m::numeric) AS distance_m
FROM public.search_campgrounds_near(49.28, -123.12, 100000, NULL, NULL);

-- Huge radius_m is clamped to 200 km
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 1e12, NULL, NULL);

-- NaN / Infinity rejected (lat and radius_m — NaN radius must NOT become 200km)
SELECT count(*) FROM public.search_campgrounds_near('NaN'::float8, -123.12, 50000, NULL, NULL);
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 'NaN'::float8, NULL, NULL);
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 'Infinity'::float8, NULL, NULL);

-- Literal % is escaped (not "match all")
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 100000, '%', NULL);

SELECT has_function_privilege(
  'anon',
  'public.search_campgrounds_near(double precision, double precision, double precision, text, text)',
  'execute'
) AS anon_exec;

SELECT prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'search_campgrounds_near';
```

## PostgREST (anon)

`POST /rest/v1/rpc/search_campgrounds_near` with body:

```json
{ "lat": 49.28, "lng": -123.12, "radius_m": 100000, "q": null, "province": null }
```

Expect 200, guest columns + `distance_m` (no commission). `prosecdef` must be false (SECURITY INVOKER).
