# Probe: hookup filters on `search_campgrounds` / `search_campgrounds_near`

Migrations:

- `20261115191024_search_campgrounds_hookup_filters` (codes + initial RPCs; demo `site_amenities` removed by follow-up)
- `20261115191846_search_hookups_harden` (cleanup demo links, per-site AND, drop `province text` overload, protect codes)
- `20261116014604_sites_electricity_amps` (site `electricity_amps`; `require_amps`; WATER/SEWER only)

## Filters

| Filter URL | Storage / match |
| --- | --- |
| `amps=none,15,30` | `sites.electricity_amps` overlap (`0` = none / empty array) |
| `electricity=1` (legacy) | App maps to amps `15,20,30,50` (“any amp”) when `amps` absent |
| `water=1` | same site → `site_amenities` `WATER` |
| `sewer=1` | same site → `site_amenities` `SEWER` |

Semantics: campground matches when **one site** satisfies the amp overlap (if any) **and** every selected water/sewer amenity.

Demo amps + water/sewer links live in `supabase/seed.sql` only (not schema migrations).

## SQL

```sql
SELECT code FROM public.amenities WHERE code IN ('ELECTRICITY','WATER','SEWER') ORDER BY 1;

SELECT name, electricity_amps FROM public.sites
WHERE cardinality(electricity_amps) > 0
ORDER BY 1;

-- Empty ELECTRICITY site links after amps migration:
SELECT count(*) FROM public.site_amenities sa
JOIN public.amenities a ON a.id = sa.amenity_id
WHERE a.code = 'ELECTRICITY';

SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 100000);

SELECT name FROM public.search_campgrounds(
  NULL, NULL, ARRAY[30]::smallint[], true, true
);

SELECT pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('search_campgrounds', 'search_campgrounds_near')
ORDER BY 1;
```

Expected identities:

- `search_campgrounds(q text, province_aliases text[], require_amps smallint[], require_water boolean, require_sewer boolean)`
- `search_campgrounds_near(lat float8, lng float8, radius_m float8, q text, province_aliases text[], require_amps smallint[], require_water boolean, require_sewer boolean)`
