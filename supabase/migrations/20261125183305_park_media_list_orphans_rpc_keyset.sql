-- #57 / PR #65 round 2: keyset paging, reject silent grace floor, drop temp table.
-- Prefer MATERIALIZED CTE over temp-table DDL (no VOLATILE catalog churn).

BEGIN;

DROP FUNCTION IF EXISTS public.list_orphan_park_media(text, integer, integer);

CREATE OR REPLACE FUNCTION public.list_orphan_park_media(
  p_project_url text,
  p_grace_seconds integer DEFAULT 86400,
  p_limit integer DEFAULT 1000,
  p_after text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grace interval;
  v_limit integer;
  v_after text;
BEGIN
  -- Caller is the service-role admin sweep only (requirePlatformAdmin first).
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_project_url IS NULL OR btrim(p_project_url) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'missing_supabase_url',
      'scanned', 0,
      'skipped_young', 0,
      'skipped_unknown_age', 0,
      'url_count', 0,
      'unparsed_count', 0,
      'has_more', false,
      'next_after', null,
      'orphans', '[]'::jsonb
    );
  END IF;

  IF p_grace_seconds IS NULL OR p_grace_seconds < 3600 THEN
    RAISE EXCEPTION 'p_grace_seconds must be >= 3600'
      USING ERRCODE = '22023';
  END IF;
  v_grace := make_interval(secs => p_grace_seconds);

  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1'
      USING ERRCODE = '22023';
  END IF;
  v_limit := LEAST(p_limit, 5000);

  v_after := nullif(btrim(coalesce(p_after, '')), '');
  IF v_after IS NOT NULL AND position('..' in v_after) > 0 THEN
    RAISE EXCEPTION 'p_after must not contain ..'
      USING ERRCODE = '22023';
  END IF;

  -- Single parse via MATERIALIZED CTE (no temp-table DDL); branch on counts in SQL.
  RETURN (
    WITH parsed AS MATERIALIZED (
      SELECT *
      FROM private.park_media_referenced_url_paths(p_project_url)
    ),
    counts AS (
      SELECT
        count(*)::integer AS url_count,
        count(*) FILTER (WHERE path IS NULL)::integer AS unparsed_count,
        count(DISTINCT path) FILTER (WHERE path IS NOT NULL)::integer AS ref_count
      FROM parsed
    ),
    abort AS (
      SELECT
        c.url_count,
        c.unparsed_count,
        c.ref_count,
        CASE
          WHEN c.unparsed_count > 0 THEN 'unparsed_media_urls'
          WHEN c.url_count > 0 AND c.ref_count = 0 THEN 'url_origin_mismatch'
          ELSE NULL
        END AS reason
      FROM counts AS c
    ),
    refs AS (
      SELECT DISTINCT path FROM parsed WHERE path IS NOT NULL
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
        -- park-media versioning is assumed off; exclude archived versions if enabled.
        AND o.archived_at IS NULL
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
        (a.created_at IS NULL) AS unknown_age,
        (
          a.created_at IS NOT NULL
          AND a.created_at < (now() - v_grace)
        ) AS old_enough
      FROM orphan_all AS a
    ),
    candidates AS (
      SELECT object_path
      FROM aged
      WHERE old_enough
        AND (v_after IS NULL OR object_path > v_after)
      ORDER BY object_path
    ),
    page AS (
      SELECT object_path FROM candidates LIMIT v_limit
    ),
    page_stats AS (
      SELECT
        coalesce(
          (SELECT jsonb_agg(p.object_path ORDER BY p.object_path) FROM page AS p),
          '[]'::jsonb
        ) AS orphans,
        (SELECT max(object_path) FROM page) AS next_after,
        (SELECT count(*)::integer FROM page) AS page_len,
        EXISTS (
          SELECT 1 FROM candidates c
          WHERE (SELECT max(object_path) FROM page) IS NOT NULL
            AND c.object_path > (SELECT max(object_path) FROM page)
        ) AS has_more
    ),
    abort_payload AS (
      SELECT jsonb_build_object(
        'ok', false,
        'reason', a.reason,
        'scanned', 0,
        'skipped_young', 0,
        'skipped_unknown_age', 0,
        'url_count', a.url_count,
        'unparsed_count', a.unparsed_count,
        'has_more', false,
        'next_after', null,
        'orphans', '[]'::jsonb
      ) AS payload
      FROM abort AS a
      WHERE a.reason IS NOT NULL
    ),
    ok_payload AS (
      SELECT jsonb_build_object(
        'ok', true,
        'reason', null,
        'scanned', (SELECT count(*)::integer FROM objects),
        'skipped_young', (
          SELECT count(*)::integer FROM aged
          WHERE NOT unknown_age AND NOT old_enough
        ),
        'skipped_unknown_age', (
          SELECT count(*)::integer FROM aged WHERE unknown_age
        ),
        'url_count', (SELECT url_count FROM abort),
        'unparsed_count', (SELECT unparsed_count FROM abort),
        'has_more', coalesce((SELECT has_more FROM page_stats), false),
        'next_after', (SELECT next_after FROM page_stats),
        'orphans', (SELECT orphans FROM page_stats)
      ) AS payload
    )
    SELECT coalesce(
      (SELECT payload FROM abort_payload),
      (SELECT payload FROM ok_payload)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.list_orphan_park_media(text, integer, integer, text) IS
  'Service-role orphan candidates in park-media (storage.objects anti-join vs '
  'campgrounds.cover_photo / sites.photos). Fail-closed on unparsed URLs. '
  'Keyset batch via p_limit/p_after/next_after. Paths for storage.remove (#57).';

REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_park_media(text, integer, integer, text)
  TO service_role;

COMMIT;
