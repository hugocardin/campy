# Search v2 parked leftovers (#24) — scale / indexes / Photon

## Migrations (filenames = live `schema_migrations` versions)

1. `20261116050437_search_scale_province_order_limit.sql` — `list_campground_province_raws`; `search_campgrounds` + `sort_key` / `result_limit` (≤200)
2. `20261116050517_campground_text_matches_indexable.sql` — index-aligned `campground_text_matches` (`<%` + null-safe city/province); province GIN; suggest/near SET LOCAL threshold
3. `20261116050526_geocode_shared_rate_limit.sql` — `geocode_rate_buckets` + `photon_circuit_*` RPCs
4. `20261116051513_photon_proxy_admit_harden.sql` — revoke anon EXECUTE; `photon_proxy_admit` (service_role, hard-coded caps, IP-first); `campground_search_prepare`; race-safe take + idle cleanup

## EXPLAIN notes (small catalog — use `enable_seqscan = off`)

```sql
BEGIN;
SET LOCAL enable_seqscan = off;

-- BitmapOr across name / city / province GIN trigram indexes:
EXPLAIN (COSTS false)
SELECT c.id
FROM public.campgrounds c
WHERE public.immutable_unaccent(c.name) ILIKE '%emer%' ESCAPE '\'
   OR (c.city IS NOT NULL AND public.immutable_unaccent(c.city) ILIKE '%emer%' ESCAPE '\')
   OR (c.province IS NOT NULL AND public.immutable_unaccent(c.province) ILIKE '%emer%' ESCAPE '\');
-- Expect: Bitmap Heap Scan → BitmapOr → Bitmap Index Scan on
--   campgrounds_name_unaccent_trgm_idx
--   campgrounds_city_unaccent_trgm_idx
--   campgrounds_province_unaccent_trgm_idx

SET LOCAL pg_trgm.word_similarity_threshold = 0.45;
EXPLAIN (COSTS false)
SELECT c.id
FROM public.campgrounds c
WHERE public.immutable_unaccent('emerld') OPERATOR(extensions.<%) public.immutable_unaccent(c.name);
-- Expect: Bitmap Index Scan on campgrounds_name_unaccent_trgm_idx

ROLLBACK;
```

Verified live (2026-11-16): BitmapOr with all three GIN indexes; `<%` uses name GIN; `suggest_campgrounds('emerld')` → Emerald Lake.

## Functional smoke

```sql
SELECT * FROM public.list_campground_province_raws();
SELECT name FROM public.search_campgrounds(q := 'emerald', sort_key := 'name', result_limit := 10);
SELECT name FROM public.suggest_campgrounds('emerld', 5);
SELECT public.geocode_rate_limit_take('photon:upstream', 40, 0.01);
SELECT public.photon_circuit_is_open();
```
