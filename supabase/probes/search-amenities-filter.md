# Probe: guest park amenities filter (#24 §3)

Migration: `20261116154127_search_amenities_filter`

## Design

| Concern | Choice |
| --- | --- |
| Semantics | **AND** — park must have every selected amenity on `campground_amenities` |
| Scope | Park-level only (same junction as dump / guest detail). Site-only tags do not match. |
| URL | `amenities=wifi,pet_friendly` (lowercase underscore tokens) |
| RPC | `require_amenity_codes text[]` on `search_campgrounds` / `_near` |
| Excluded | `WATER` / `SEWER` / `DUMP_STATION` / `ELECTRICITY` (dedicated controls) |
| Catalog | Admin amenities via `getAllAmenities`, filtered for guest UI |

## Live smoke (anon-callable)

```sql
SELECT public.amenity_code_canonical_key('PET FRIENDLY'); -- PET_FRIENDLY

SELECT public.normalize_guest_amenity_codes(ARRAY['wifi', 'PET FRIENDLY', 'WATER']);
-- {PET_FRIENDLY,WIFI}

SELECT name
FROM search_campgrounds(
  require_amenity_codes := ARRAY['WIFI'],
  result_limit := 20
);

SELECT name
FROM search_campgrounds(
  require_amenity_codes := ARRAY['WIFI', 'PET_FRIENDLY'],
  result_limit := 20
);
```

Expected after seed: Alice Lake matches WIFI+PET_FRIENDLY. Unknown codes (not in `amenities`) normalize to empty → fail-open (no amenity restriction), same abuse posture as oversized site-types.
