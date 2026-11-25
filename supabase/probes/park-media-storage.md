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

## Manual smoke

1. Platform admin → campground detail → upload cover → guest search card shows URL.
2. Platform admin → site detail → upload photos → guest campground detail site row / gallery shows them.
3. Non-admin authenticated user: Storage upload to `park-media` must fail (RLS).
4. Anon: public object URL still loads (no auth header).

## Dashboard fallback (if Storage policies fail in SQL Editor)

If `CREATE POLICY … ON storage.objects` errors with ownership (`must be owner of table objects`):

1. Dashboard → **Storage** → New bucket `park-media` → Public.
2. Restrict MIME to `image/jpeg`, `image/png`, `image/webp`; size 5 MB.
3. Policies → add the four policies from the migration (SELECT public; INSERT/UPDATE/DELETE = `is_platform_admin()`).
4. Still apply the non-Storage parts of the migration (column + views + grants) via SQL Editor / MCP.
