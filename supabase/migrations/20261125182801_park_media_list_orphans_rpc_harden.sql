-- #57 / PR #65 review: harden list_orphan_park_media.
-- - service_role EXECUTE only; grace floor 3600s
-- - single URL-collection helper (no duplicated parse)
-- - percent-decode parity with decodeURIComponent; origin comment
-- - skip archived / delete-marker rows (versioning assumed off otherwise)
-- - skipped_unknown_age for NULL created_at; p_limit + has_more
-- - orphans are path strings only (no created_at payload)

BEGIN;

-- ---------------------------------------------------------------------------
-- Percent-decode: trailing / truncated %XX -> NULL (match decodeURIComponent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.uri_percent_decode(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_out bytea := '\x'::bytea;
  v_i int := 1;
  v_len int := char_length(p_value);
  v_c text;
  v_hex text;
BEGIN
  IF position('%' in p_value) = 0 THEN
    RETURN p_value;
  END IF;

  WHILE v_i <= v_len LOOP
    v_c := substr(p_value, v_i, 1);
    IF v_c = '%' THEN
      -- Incomplete escape (e.g. trailing '%' or '%2') - JS decodeURIComponent throws.
      IF v_i + 2 > v_len THEN
        RETURN NULL;
      END IF;
      v_hex := substr(p_value, v_i + 1, 2);
      IF v_hex ~ '^[0-9A-Fa-f]{2}$' THEN
        v_out := v_out || decode(v_hex, 'hex');
        v_i := v_i + 3;
        CONTINUE;
      END IF;
      RETURN NULL;
    END IF;
    v_out := v_out || convert_to(v_c, 'UTF8');
    v_i := v_i + 1;
  END LOOP;

  RETURN convert_from(v_out, 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.uri_percent_decode(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Path extractor: regex origin is stricter than JS URL.origin (fail-closed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.park_media_object_path_from_public_url(
  p_url text,
  p_project_url text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_base text;
  v_url_origin text;
  v_base_origin text;
  v_pathname text;
  v_encoded text;
  v_path text;
  v_prefix constant text := '/storage/v1/object/public/park-media/';
BEGIN
  IF p_url IS NULL OR p_project_url IS NULL THEN
    RETURN NULL;
  END IF;

  v_url := btrim(p_url);
  v_base := btrim(p_project_url);
  IF v_url = '' OR v_base = '' THEN
    RETURN NULL;
  END IF;

  -- Stricter than JS `new URL().origin` (no default-port / userinfo normalize).
  -- Mismatch -> NULL -> sweep aborts (fail-closed); do not loosen toward fail-open.
  v_url_origin := (regexp_match(v_url, '^(https?://[^/?#]+)', 'i'))[1];
  v_base_origin := (regexp_match(v_base, '^(https?://[^/?#]+)', 'i'))[1];
  IF v_url_origin IS NULL OR v_base_origin IS NULL THEN
    RETURN NULL;
  END IF;
  IF lower(v_url_origin) <> lower(v_base_origin) THEN
    RETURN NULL;
  END IF;

  v_pathname := (regexp_match(v_url, '^https?://[^/?#]+(/[^?#]*)', 'i'))[1];
  IF v_pathname IS NULL OR position(v_prefix in v_pathname) <> 1 THEN
    RETURN NULL;
  END IF;

  v_encoded := substr(v_pathname, char_length(v_prefix) + 1);
  IF v_encoded IS NULL OR v_encoded = '' THEN
    RETURN NULL;
  END IF;

  v_path := private.uri_percent_decode(v_encoded);
  IF v_path IS NULL OR v_path = '' OR position('..' in v_path) > 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION private.park_media_object_path_from_public_url(text, text)
  FROM PUBLIC;

-- Single source for cover + site photo URL -> path (counts + anti-join share this).
CREATE OR REPLACE FUNCTION private.park_media_referenced_url_paths(
  p_project_url text
)
RETURNS TABLE(url text, path text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    u.url,
    private.park_media_object_path_from_public_url(u.url, p_project_url) AS path
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
  ) AS u;
$$;

REVOKE ALL ON FUNCTION private.park_media_referenced_url_paths(text) FROM PUBLIC;

-- Replace 2-arg overload with 3-arg (p_limit).
DROP FUNCTION IF EXISTS public.list_orphan_park_media(text, integer);

CREATE OR REPLACE FUNCTION public.list_orphan_park_media(
  p_project_url text,
  p_grace_seconds integer DEFAULT 86400,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grace_secs integer;
  v_grace interval;
  v_limit integer;
  v_url_count integer := 0;
  v_unparsed_count integer := 0;
  v_ref_count integer := 0;
  v_scanned integer := 0;
  v_skipped_young integer := 0;
  v_skipped_unknown_age integer := 0;
  v_orphan_total integer := 0;
  v_orphans jsonb := '[]'::jsonb;
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
      'orphans', '[]'::jsonb
    );
  END IF;

  IF p_grace_seconds IS NULL OR p_grace_seconds < 0 THEN
    RAISE EXCEPTION 'p_grace_seconds must be >= 0'
      USING ERRCODE = '22023';
  END IF;

  -- Floor grace so a caller cannot list in-flight uploads (min 1 hour).
  v_grace_secs := GREATEST(p_grace_seconds, 3600);
  v_grace := make_interval(secs => v_grace_secs);

  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1'
      USING ERRCODE = '22023';
  END IF;
  v_limit := LEAST(p_limit, 5000);

  -- One parse of every referenced URL (shared helper); reuse for counts + anti-join.
  DROP TABLE IF EXISTS pg_temp.park_media_ref_paths;
  CREATE TEMP TABLE park_media_ref_paths (
    url text,
    path text
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.park_media_ref_paths (url, path)
  SELECT r.url, r.path
  FROM private.park_media_referenced_url_paths(p_project_url) AS r;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE path IS NULL)::integer,
    count(DISTINCT path) FILTER (WHERE path IS NOT NULL)::integer
  INTO v_url_count, v_unparsed_count, v_ref_count
  FROM pg_temp.park_media_ref_paths;

  IF v_unparsed_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unparsed_media_urls',
      'scanned', 0,
      'skipped_young', 0,
      'skipped_unknown_age', 0,
      'url_count', v_url_count,
      'unparsed_count', v_unparsed_count,
      'has_more', false,
      'orphans', '[]'::jsonb
    );
  END IF;

  IF v_url_count > 0 AND v_ref_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'url_origin_mismatch',
      'scanned', 0,
      'skipped_young', 0,
      'skipped_unknown_age', 0,
      'url_count', v_url_count,
      'unparsed_count', v_unparsed_count,
      'has_more', false,
      'orphans', '[]'::jsonb
    );
  END IF;

  WITH refs AS (
    SELECT DISTINCT path
    FROM pg_temp.park_media_ref_paths
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
        AND a.created_at < (clock_timestamp() - v_grace)
      ) AS old_enough
    FROM orphan_all AS a
  ),
  candidates AS (
    SELECT object_path
    FROM aged
    WHERE old_enough
    ORDER BY object_path
  ),
  page AS (
    SELECT object_path FROM candidates LIMIT v_limit
  ),
  summary AS (
    SELECT
      (SELECT count(*)::integer FROM objects) AS scanned,
      (SELECT count(*)::integer FROM aged WHERE NOT unknown_age AND NOT old_enough)
        AS skipped_young,
      (SELECT count(*)::integer FROM aged WHERE unknown_age) AS skipped_unknown_age,
      (SELECT count(*)::integer FROM candidates) AS orphan_total,
      coalesce(
        (SELECT jsonb_agg(p.object_path ORDER BY p.object_path) FROM page AS p),
        '[]'::jsonb
      ) AS orphans
  )
  SELECT
    s.scanned,
    s.skipped_young,
    s.skipped_unknown_age,
    s.orphan_total,
    s.orphans
  INTO
    v_scanned,
    v_skipped_young,
    v_skipped_unknown_age,
    v_orphan_total,
    v_orphans
  FROM summary AS s;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', null,
    'scanned', coalesce(v_scanned, 0),
    'skipped_young', coalesce(v_skipped_young, 0),
    'skipped_unknown_age', coalesce(v_skipped_unknown_age, 0),
    'url_count', v_url_count,
    'unparsed_count', v_unparsed_count,
    'has_more', coalesce(v_orphan_total, 0) > v_limit,
    'orphans', coalesce(v_orphans, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.list_orphan_park_media(text, integer, integer) IS
  'Service-role orphan candidates in park-media (storage.objects anti-join vs '
  'campgrounds.cover_photo / sites.photos). Fail-closed on unparsed URLs. '
  'Batched via p_limit/has_more. Returns paths for storage.remove (#57).';

REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer)
  FROM anon;
REVOKE ALL ON FUNCTION public.list_orphan_park_media(text, integer, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_park_media(text, integer, integer)
  TO service_role;

COMMIT;
