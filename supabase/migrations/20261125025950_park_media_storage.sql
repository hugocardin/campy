-- Phase C: park media Storage + campground cover_photo.
-- Bucket: park-media (public read). Writes gated by is_platform_admin().
-- sites.photos (text[]) already exists — no schema change for sites.
-- cover_photo is new on campgrounds (no existing cover column).

BEGIN;

-- ---------------------------------------------------------------------------
-- campgrounds.cover_photo
-- ---------------------------------------------------------------------------
ALTER TABLE public.campgrounds
  ADD COLUMN IF NOT EXISTS cover_photo text;

COMMENT ON COLUMN public.campgrounds.cover_photo IS
  'Public URL for park cover image (Supabase Storage park-media bucket). '
  'NULL = guest UI shows placeholder.';

COMMENT ON COLUMN public.sites.photos IS
  'Public image URLs for this site (Supabase Storage park-media bucket). '
  'Empty array = no photos; guest UI keeps placeholders.';

-- ---------------------------------------------------------------------------
-- Guest + admin views (append cover_photo at end)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_campgrounds
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  description,
  address,
  city,
  province,
  country,
  website,
  phone,
  st_y(location::geometry) AS latitude,
  st_x(location::geometry) AS longitude,
  currency,
  cover_photo
FROM public.campgrounds
WHERE active = true;

COMMENT ON VIEW public.v_campgrounds IS
  'Guest-facing active campgrounds (no commission fields; security_invoker).';

REVOKE ALL ON TABLE public.v_campgrounds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_campgrounds TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_campgrounds_admin AS
SELECT
  c.id,
  c.owner_id,
  p.full_name AS owner_full_name,
  p.email AS owner_email,
  c.name,
  c.description,
  c.address,
  c.city,
  c.province,
  c.country,
  c.website,
  c.phone,
  c.active,
  c.commission_type_id,
  c.commission_value,
  st_y(c.location::geometry) AS latitude,
  st_x(c.location::geometry) AS longitude,
  c.currency,
  c.cover_photo
FROM public.campgrounds AS c
LEFT JOIN public.profiles AS p ON c.owner_id = p.id;

COMMENT ON VIEW public.v_campgrounds_admin IS
  'Admin catalog of all campgrounds + owner identity (direct SELECT revoked).';

REVOKE ALL ON TABLE public.v_campgrounds_admin FROM PUBLIC, anon, authenticated;

-- Column-level SELECT for new cover_photo (commission_* stay non-SELECT for guests).
GRANT SELECT (cover_photo) ON TABLE public.campgrounds TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: park-media (public)
-- Path layout:
--   {campgroundId}/cover/{uuid}.ext
--   {campgroundId}/sites/{siteId}/{uuid}.ext
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'park-media',
  'park-media',
  true,
  5242880, -- 5 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop prior Campy policies on this bucket (idempotent re-apply).
DROP POLICY IF EXISTS "park_media_public_select" ON storage.objects;
DROP POLICY IF EXISTS "park_media_platform_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "park_media_platform_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "park_media_platform_admin_delete" ON storage.objects;

-- Public bucket: anyone can read objects (CDN / next/image).
CREATE POLICY "park_media_public_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'park-media');

-- Platform admin writes (upsert needs INSERT + SELECT + UPDATE).
CREATE POLICY "park_media_platform_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'park-media'
    AND (SELECT public.is_platform_admin())
  );

CREATE POLICY "park_media_platform_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'park-media'
    AND (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    bucket_id = 'park-media'
    AND (SELECT public.is_platform_admin())
  );

CREATE POLICY "park_media_platform_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'park-media'
    AND (SELECT public.is_platform_admin())
  );

COMMIT;
