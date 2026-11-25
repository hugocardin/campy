-- Phase C park-media review follow-up:
-- 1) Drop public SELECT on storage.objects (public bucket CDN does not need it;
--    it allowed anon list() of every object / UUID path).
-- 2) Atomic append/remove for sites.photos to avoid lost updates under concurrent admin uploads.

BEGIN;

DROP POLICY IF EXISTS "park_media_public_select" ON storage.objects;

-- Platform admin may SELECT objects (upsert / list) via is_platform_admin().
DROP POLICY IF EXISTS "park_media_platform_admin_select" ON storage.objects;
CREATE POLICY "park_media_platform_admin_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'park-media'
    AND (SELECT public.is_platform_admin())
  );

CREATE OR REPLACE FUNCTION public.append_site_photo(
  p_campground_id uuid,
  p_site_id uuid,
  p_photo_url text,
  p_max integer DEFAULT 12
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_photos text[];
BEGIN
  IF p_photo_url IS NULL OR btrim(p_photo_url) = '' THEN
    RAISE EXCEPTION 'photo_url required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sites AS s
  SET
    photos = coalesce(s.photos, '{}'::text[]) || ARRAY[p_photo_url],
    updated_at = now()
  WHERE s.id = p_site_id
    AND s.campground_id = p_campground_id
    AND cardinality(coalesce(s.photos, '{}'::text[])) < greatest(coalesce(p_max, 12), 1)
  RETURNING s.photos INTO v_photos;

  IF NOT FOUND THEN
    -- Distinguish missing site vs cap reached for clearer app errors.
    IF NOT EXISTS (
      SELECT 1
      FROM public.sites AS s
      WHERE s.id = p_site_id
        AND s.campground_id = p_campground_id
    ) THEN
      RAISE EXCEPTION 'site not found' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'site photo limit reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_photos;
END;
$$;

COMMENT ON FUNCTION public.append_site_photo(uuid, uuid, text, integer) IS
  'Atomically append one URL to sites.photos when under p_max (platform-admin RLS).';

REVOKE ALL ON FUNCTION public.append_site_photo(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_site_photo(uuid, uuid, text, integer)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_site_photo(
  p_campground_id uuid,
  p_site_id uuid,
  p_photo_url text
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_photos text[];
BEGIN
  IF p_photo_url IS NULL OR btrim(p_photo_url) = '' THEN
    RAISE EXCEPTION 'photo_url required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sites AS s
  SET
    photos = array_remove(coalesce(s.photos, '{}'::text[]), p_photo_url),
    updated_at = now()
  WHERE s.id = p_site_id
    AND s.campground_id = p_campground_id
    AND p_photo_url = ANY (coalesce(s.photos, '{}'::text[]))
  RETURNING s.photos INTO v_photos;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sites AS s
      WHERE s.id = p_site_id
        AND s.campground_id = p_campground_id
    ) THEN
      RAISE EXCEPTION 'site not found' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'photo not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_photos;
END;
$$;

COMMENT ON FUNCTION public.remove_site_photo(uuid, uuid, text) IS
  'Atomically remove one URL from sites.photos (platform-admin RLS).';

REVOKE ALL ON FUNCTION public.remove_site_photo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_site_photo(uuid, uuid, text)
  TO authenticated;

COMMIT;
