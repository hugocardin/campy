# Probe: `search_campgrounds_near`

Migration: `20261115032320_search_campgrounds_near.sql`

## SQL

```sql
-- Within ~100 km of downtown Vancouver — expect Squamish / Maple Ridge parks
SELECT name, city
FROM public.search_campgrounds_near(49.28, -123.12, 100000, NULL, NULL)
ORDER BY name;

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

Expect 200 and guest columns only (no commission). `prosecdef` must be false (SECURITY INVOKER).
