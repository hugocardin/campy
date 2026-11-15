# Probe: hookup filters on `search_campgrounds` / `search_campgrounds_near`

Migration: `20261115191024_search_campgrounds_hookup_filters.sql` (rename if live `schema_migrations` version differs).

## Amenity codes

| Filter URL | Amenity `code` | Match path |
| --- | --- | --- |
| `electricity=1` | `ELECTRICITY` | `sites` → `site_amenities` → `amenities` |
| `water=1` | `WATER` | same |
| `sewer=1` | `SEWER` | same |

Semantics: campground matches when **at least one site** has each selected amenity (**AND** across selected filters). Campground-level amenities are not used for hookups.

## SQL

```sql
SELECT code FROM public.amenities WHERE code IN ('ELECTRICITY','WATER','SEWER') ORDER BY 1;

SELECT name FROM public.search_campgrounds(NULL, NULL, true, false, false) ORDER BY 1;
SELECT name FROM public.search_campgrounds(NULL, NULL, true, true, false) ORDER BY 1;
SELECT name FROM public.search_campgrounds(NULL, NULL, true, true, true) ORDER BY 1;

-- Near-me + electricity (Vancouver ~100km)
SELECT name, round(distance_m::numeric) AS distance_m
FROM public.search_campgrounds_near(49.28, -123.12, 100000, NULL, NULL, true, false, false);

-- Old named-arg clients (no require_*): still work via defaults / province text wrapper
SELECT count(*) FROM public.search_campgrounds(NULL, NULL);
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 100000, NULL, 'BC'::text);

SELECT prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('search_campgrounds', 'search_campgrounds_near');
```

Expect `prosecdef = false`. Guest columns only (no `commission_*`).
