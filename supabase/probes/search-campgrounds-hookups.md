# Probe: hookup / dump / driveway / rig filters on search RPCs

Migrations:

- `20261115191024_search_campgrounds_hookup_filters` (codes + initial RPCs; demo `site_amenities` removed by follow-up)
- `20261115191846_search_hookups_harden` (cleanup demo links, per-site AND, drop `province text` overload, protect codes)
- `20261116014604_sites_electricity_amps` (site `electricity_amps`; `require_amps`; WATER/SEWER only)
- `20261116015837_sites_electricity_amps_harden` (amp values helper; temporary `require_electricity` boolean overloads; retire ELECTRICITY amenity)
- `20261116022329_dump_driveway_rig_search` (DUMP_STATION; `driveway_type`; max_rig rules; protect DUMP_STATION)
- `20261116022503_dump_driveway_rig_search_rpcs` / `20261116022628_*` (`min_rig_length`; `stay_kind`; near + temporary boolean compat, dropped in `20261116034908`)
- follow-up hardens CHECK→trigger + shared site-filter helper
- `20261116034908_drop_require_electricity_search_overloads` (issue #30 — drop boolean compat wrappers; `require_amps` only)

## Filters

| Filter URL | Storage / match |
| --- | --- |
| `amps=none,15,30` | `sites.electricity_amps` overlap (`0` = none / empty array) |
| `electricity=1` (legacy) | App maps to amps `15,20,30,50` (“any amp”) when `amps` absent |
| `water=1` | same site → `site_amenities` `WATER` |
| `sewer=1` | same site → `site_amenities` `SEWER` |
| `driveway=pull_through\|back_in` | same site → `sites.driveway_type` |
| `rigLength=35` | same site → `max_rig_length >= 35` **feet** (ignored when `stay=lodging`) |
| `rigUnit=m` | display/input unit for the guest filter (`ft` default when omitted; kept even when `stay=lodging`). Does **not** change `rigLength` meaning — that param is always feet. Cap: 200 ft (metre max derived ≈ 60.96 m). |
| `stay=camping\|lodging` | same site → non-LODGING / LODGING site type |
| `dump=1` | park → `campground_amenities` `DUMP_STATION` (not same-site) |

Semantics: campground matches when **one site** satisfies the site-level filters (amps, water/sewer, driveway, rig, stay) **and** (if selected) the park has a dump station.

Demo dump / driveway / amps / water/sewer links live in `supabase/seed.sql` only (not schema migrations).

## SQL

```sql
SELECT code FROM public.amenities
WHERE code IN ('WATER','SEWER','DUMP_STATION')
ORDER BY 1;

SELECT name, electricity_amps, driveway_type, max_rig_length
FROM public.sites
ORDER BY 1;

SELECT count(*) FROM public.search_campgrounds_near(49.28, -123.12, 100000);

SELECT name FROM public.search_campgrounds(
  NULL, NULL, ARRAY[30]::smallint[], true, true,
  false, 'PULL_THROUGH', 30, 'camping'
);

SELECT name FROM public.search_campgrounds(
  NULL, NULL, NULL, false, false,
  true, NULL, NULL, NULL
);

SELECT pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('search_campgrounds', 'search_campgrounds_near')
ORDER BY 1;
```

Expected identities:

- `search_campgrounds(q text, province_aliases text[], require_amps smallint[], require_water boolean, require_sewer boolean, require_dump_station boolean, require_driveway_type text, min_rig_length numeric, stay_kind text)`
- `search_campgrounds_near(lat float8, lng float8, radius_m float8, q text, province_aliases text[], require_amps smallint[], require_water boolean, require_sewer boolean, require_dump_station boolean, require_driveway_type text, min_rig_length numeric, stay_kind text)`
