# Probe: guest park amenities filter (#24 §3)

Migrations:

- `20261116154552_search_amenities_filter`
- `20261116155510_search_amenities_review_fix` (#47 review: search_path, amenity ids, fail-closed unknowns, remove migration seed rows)
- `20261116155733_search_amenities_review_followup` (#47: unique canonical key index; drop unused `normalize_guest_amenity_codes`)

## Design

| Concern | Choice |
| --- | --- |
| Semantics | **AND** — park must have every selected amenity on `campground_amenities` |
| Scope | Park-level only (same junction as dump / guest detail). Site-only tags do not match. |
| URL | `amenities=wifi,pet_friendly` (lowercase underscore tokens) |
| RPC | `require_amenity_codes text[]` → `normalize_guest_amenity_ids` |
| Unknown codes | **Fail closed** (`NULL` ids → no parks). UI still shows URL-only chips so guests can uncheck. |
| Excluded | `WATER` / `SEWER` / `DUMP_STATION` / `ELECTRICITY` (sync with `lib/guest-amenity-codes.ts` + `PROTECTED_HOOKUP_AMENITY_CODES`) |
| Catalog | Admin amenities via `getAllAmenities`; sort checkboxes by translated label |
| Demo data | `supabase/seed.sql` only — not schema migrations |

## Live smoke (anon-callable)

```sql
SELECT public.amenity_code_canonical_key('PET FRIENDLY'); -- PET_FRIENDLY

SELECT public.normalize_guest_amenity_ids(ARRAY['wifi', 'PET FRIENDLY']);
-- uuid[] of matching amenities

SELECT public.normalize_guest_amenity_ids(ARRAY['POOL']);
-- NULL (unknown → fail closed)

SELECT public.normalize_guest_amenity_ids(
  ARRAY(SELECT 'WIFI'::text FROM generate_series(1, 17))
);
-- {<wifi id>} — duplicates collapse; distinct-key cap not hit

SELECT public.normalize_guest_amenity_ids(
  ARRAY(SELECT 'X' || g FROM generate_series(1, 17) g)
);
-- NULL (>16 distinct keys after exclusion)

SELECT public.normalize_guest_amenity_ids(
  ARRAY(SELECT 'WIFI'::text FROM generate_series(1, 65))
);
-- NULL (raw cardinality >64 DoS guard)

SELECT name
FROM search_campgrounds(
  require_amenity_codes := ARRAY['WIFI'],
  result_limit := 20
);

SELECT name
FROM search_campgrounds(
  require_amenity_codes := ARRAY['NOT_A_REAL_AMENITY'],
  result_limit := 20
);
-- no rows
```
