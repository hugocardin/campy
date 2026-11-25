# Probe: park-media Storage + cover_photo (Phase C)

Migration: `20261125025950_park_media_storage.sql`

## Before apply

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campgrounds' AND column_name = 'cover_photo';

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'park-media';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'park_media%';
```

Expect: no `cover_photo`, no bucket, no `park_media%` policies.

## After apply

1. `campgrounds.cover_photo` exists (nullable text).
2. `v_campgrounds` / `v_campgrounds_admin` expose `cover_photo`.
3. Bucket `park-media` is public, 5 MiB, jpeg/png/webp.
4. Policies: authenticated SELECT/INSERT/UPDATE/DELETE gated by `is_platform_admin()`
   (no public SELECT — public bucket CDN URLs do not need RLS; listing stays admin-only).
5. RPCs `append_site_photo` / `remove_site_photo` for atomic `sites.photos` updates
   (`20261125031029_park_media_review_followup.sql`).
6. `append_site_photo(uuid,uuid,text)` uses a fixed 12-photo cap
   (`20261125032045_park_media_append_cap.sql`); browser uploads to Storage, then
   Server Actions only commit URLs (no raised `serverActions.bodySizeLimit`).
7. Guest search RPCs return `cover_photo` (`20261125033810_search_rpc_cover_photo.sql`,
   [#57](https://github.com/hugocardin/campy/issues/57)) — no `enrichCampgroundCovers`.
   Run as `anon` so column grants are exercised; expect 0 mismatches vs `v_campgrounds`.

```sql
BEGIN;
SET LOCAL ROLE anon;

SELECT count(*) AS mismatches
FROM public.search_campgrounds(result_limit := 500) s
JOIN public.v_campgrounds v USING (id)
WHERE s.cover_photo IS DISTINCT FROM v.cover_photo;

SELECT count(*) AS mismatches
FROM public.search_campgrounds_near(49.28, -123.12, 200000, result_limit := 500) s
JOIN public.v_campgrounds v USING (id)
WHERE s.cover_photo IS DISTINCT FROM v.cover_photo;

ROLLBACK;
```

## Manual smoke

1. Platform admin → campground detail → upload cover → guest search card shows URL.
2. Platform admin → site detail → upload photos → guest campground detail site row / gallery shows them.
3. Non-admin authenticated user: Storage upload to `park-media` must fail (RLS).
4. Anon: public object URL still loads (no auth header).
5. Delete site / campground (no bookings): row gone; Storage under
   `{campgroundId}/sites/{siteId}/` or `{campgroundId}/` cleaned via `after()`
   (best-effort; campground must be inactive first).
6. Admin dashboard → “Sweep orphan media”: fail-closed; only objects older than
   24h and unreferenced are removed. Listing uses
   `list_orphan_park_media` (SQL over `storage.objects`; migrations
   `20261125181714` -> `181806` auth gate -> `182801` harden ->
   `20261125183305_park_media_list_orphans_rpc_keyset`). Periodic cron still
   parked (#57).

```sql
-- Probe listing RPC (service_role JWT claim; MCP/SQL editor has no JWT by default):
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.list_orphan_park_media(
  'https://<project-ref>.supabase.co',
  86400,
  1000,
  NULL  -- p_after keyset cursor
);

-- Grace below 3600 must fail (22023):
-- SELECT public.list_orphan_park_media('https://<project-ref>.supabase.co', 10, 1000, NULL);

-- Decoder parity with decodeURIComponent (truncated % -> NULL):
SELECT private.uri_percent_decode('abc%2') IS NULL AS truncated_pct;
SELECT private.uri_percent_decode('cg%2Fcover%2Fa.jpg') = 'cg/cover/a.jpg' AS decoded;
```

## Dashboard fallback (if Storage policies fail in SQL Editor)

If `CREATE POLICY … ON storage.objects` errors with ownership (`must be owner of table objects`):

1. Dashboard → **Storage** → New bucket `park-media` → Public.
2. Restrict MIME to `image/jpeg`, `image/png`, `image/webp`; size 5 MB.
3. Policies → add the four policies from the migration (SELECT public; INSERT/UPDATE/DELETE = `is_platform_admin()`).
4. Still apply the non-Storage parts of the migration (column + views + grants) via SQL Editor / MCP.
