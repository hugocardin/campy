-- Harden append_site_photo: fixed 12-photo cap (not caller-controlled),
-- distinct message marker for app mapping (not bare P0001).

BEGIN;

DROP FUNCTION IF EXISTS public.append_site_photo(uuid, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.append_site_photo(
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
  -- Keep in sync with PARK_MEDIA_MAX_SITE_PHOTOS in lib/park-media.ts
  c_max constant integer := 12;
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
    AND cardinality(coalesce(s.photos, '{}'::text[])) < c_max
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
    -- Marker string is matched in appendSitePhotoAction (not bare P0001).
    RAISE EXCEPTION 'park_media_site_photos_at_cap'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_photos;
END;
$$;

COMMENT ON FUNCTION public.append_site_photo(uuid, uuid, text) IS
  'Atomically append one URL to sites.photos when under the fixed 12-photo cap (platform-admin RLS).';

REVOKE ALL ON FUNCTION public.append_site_photo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_site_photo(uuid, uuid, text)
  TO authenticated;

COMMIT;
