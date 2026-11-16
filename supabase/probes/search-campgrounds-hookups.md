# Probe: hookup filters on `search_campgrounds` / `search_campgrounds_near`

Migrations:

- `20261115191024_search_campgrounds_hookup_filters` (codes + initial RPCs; demo `site_amenities` removed by follow-up)
- `20261115191846_search_hookups_harden` (cleanup demo links, per-site AND, drop `province text` overload, protect codes)

## Amenity codes

| Filter URL | Amenity `code` | Match path |
| --- | --- | --- |
| `electricity=1` | `ELECTRICITY` | one `sites` row → `site_amenities` |
| `water=1` | `WATER` | same site |
| `sewer=1` | `SEWER` | same site |

Semantics: campground matches when **one site** has **every** selected amenity (`GROUP BY s.id HAVING count(DISTINCT am.code) = cardinality(required_codes)`).

Demo site links live in `supabase/seed.sql` only (not schema migrations).

## SQL

```sql
SELECT code FROM public.amenities WHERE code IN ('ELECTRICITY','WATER','SEWER') ORDER BY 1;

-- Empty until seed.sql applied:
SELECT count(*) FROM public.site_amenities sa
JOIN public.amenities a ON a.id = sa.amenity_id
WHERE a.code IN ('ELECTRICITY','WATER','SEWER');

-- 3-arg near call must resolve uniquely (province text overload dropped)
SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 100000);

SELECT name FROM public.search_campgrounds(NULL, NULL, true, true, true);

SELECT pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'search_campgrounds_near'
ORDER BY 1;

-- Protect trigger
UPDATE public.amenities SET code = 'POWER' WHERE code = 'ELECTRICITY'; -- expect 23514

SELECT prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('search_campgrounds', 'search_campgrounds_near');
```

Expect `prosecdef = false`. Guest columns only (no `commission_*`).
