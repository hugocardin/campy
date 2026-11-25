-- Fix list_orphan_park_media auth gate: SECURITY DEFINER makes current_user the
-- owner, so gate on auth.role() / is_platform_admin() instead (#57).

BEGIN;

CREATE OR REPLACE FUNCTION public.list_orphan_park_media(
  p_project_url text,
  p_grace_seconds integer DEFAULT 86400
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grace interval;
  v_url_count integer := 0;
  v_unparsed_count integer := 0;
  v_ref_count integer := 0;
  v_scanned integer := 0;
  v_skipped_young integer := 0;
  v_orphans jsonb := '[]'::jsonb;
BEGIN
  -- SECURITY DEFINER: current_user is the owner; use JWT role / admin helper.
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin required'
      USING ERRCODE = '42501';
  END IF;

  IF p_project_url IS NULL OR btrim(p_project_url) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'missing_supabase_url',
      'scanned', 0,
      'skipped_young', 0,
      'url_count', 0,
      'unparsed_count', 0,
      'orphans', '[]'::jsonb
    );
  END IF;

  IF p_grace_seconds IS NULL OR p_grace_seconds < 0 THEN
    RAISE EXCEPTION 'p_grace_seconds must be >= 0'
      USING ERRCODE = '22023';
  END IF;

  v_grace := make_interval(secs => p_grace_seconds);

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE path IS NULL)::integer,
    count(DISTINCT path) FILTER (WHERE path IS NOT NULL)::integer
  INTO v_url_count, v_unparsed_count, v_ref_count
  FROM (
    SELECT private.park_media_object_path_from_public_url(u.url, p_project_url) AS path
    FROM (
      SELECT btrim(c.cover_photo) AS url
      FROM public.campgrounds AS c
      WHERE c.cover_photo IS NOT NULL
        AND btrim(c.cover_photo) <> ''
      UNION ALL
      SELECT btrim(p.photo) AS url
      FROM public.sites AS s
      CROSS JOIN LATERAL unnest(coalesce(s.photos, '{}'::text[])) AS p(photo)
      WHERE btrim(p.photo) <> ''
    ) AS u
  ) AS parsed;

  IF v_unparsed_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unparsed_media_urls',
      'scanned', 0,
      'skipped_young', 0,
      'url_count', v_url_count,
      'unparsed_count', v_unparsed_count,
      'orphans', '[]'::jsonb
    );
  END IF;

  IF v_url_count > 0 AND v_ref_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'url_origin_mismatch',
      'scanned', 0,
      'skipped_young', 0,
      'url_count', v_url_count,
      'unparsed_count', v_unparsed_count,
      'orphans', '[]'::jsonb
    );
  END IF;

  WITH refs AS (
    SELECT DISTINCT path
    FROM (
      SELECT private.park_media_object_path_from_public_url(u.url, p_project_url) AS path
      FROM (
        SELECT btrim(c.cover_photo) AS url
        FROM public.campgrounds AS c
        WHERE c.cover_photo IS NOT NULL
          AND btrim(c.cover_photo) <> ''
        UNION ALL
        SELECT btrim(p.photo) AS url
        FROM public.sites AS s
        CROSS JOIN LATERAL unnest(coalesce(s.photos, '{}'::text[])) AS p(photo)
        WHERE btrim(p.photo) <> ''
      ) AS u
    ) AS parsed
    WHERE path IS NOT NULL
  ),
  objects AS (
    SELECT
      o.name AS object_path,
      o.created_at
    FROM storage.objects AS o
    WHERE o.bucket_id = 'park-media'
      AND o.name IS NOT NULL
      AND o.name <> ''
      AND position('..' in o.name) = 0
      AND coalesce(o.is_delete_marker, false) = false
  ),
  scanned AS (
    SELECT count(*)::integer AS n FROM objects
  ),
  orphan_all AS (
    SELECT o.object_path, o.created_at
    FROM objects AS o
    WHERE NOT EXISTS (
      SELECT 1 FROM refs AS r WHERE r.path = o.object_path
    )
  ),
  aged AS (
    SELECT
      a.object_path,
      a.created_at,
      (
        a.created_at IS NOT NULL
        AND a.created_at < (clock_timestamp() - v_grace)
      ) AS old_enough
    FROM orphan_all AS a
  ),
  summary AS (
    SELECT
      (SELECT n FROM scanned) AS scanned,
      count(*) FILTER (WHERE NOT old_enough)::integer AS skipped_young,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'path', object_path,
            'created_at', created_at
          )
          ORDER BY object_path
        ) FILTER (WHERE old_enough),
        '[]'::jsonb
      ) AS orphans
    FROM aged
  )
  SELECT s.scanned, s.skipped_young, s.orphans
  INTO v_scanned, v_skipped_young, v_orphans
  FROM summary AS s;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', null,
    'scanned', coalesce(v_scanned, 0),
    'skipped_young', coalesce(v_skipped_young, 0),
    'url_count', v_url_count,
    'unparsed_count', v_unparsed_count,
    'orphans', coalesce(v_orphans, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.list_orphan_park_media(text, integer) IS
  'Platform-admin orphan candidates in park-media (storage.objects anti-join vs '
  'campgrounds.cover_photo / sites.photos). Fail-closed on unparsed URLs. '
  'Returns paths for storage.remove — does not delete rows. Manual sweep (#57).';

REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_orphan_park_media(text, integer)
  TO authenticated, service_role;

COMMIT;
