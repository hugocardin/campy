-- Issue #24 / PR #39 review: harden Photon shared limiter + GUC helper.
-- - Revoke anon/authenticated EXECUTE on parameterized limiter/circuit RPCs
-- - Add service-role-only photon_proxy_admit (hard-coded caps; IP before upstream)
-- - Fix first-take race; opportunistic idle-bucket cleanup
-- - campground_search_prepare() centralizes word_similarity_threshold = 0.45
-- Applied live as version (MCP will assign); filename updated after apply.

-- ---------------------------------------------------------------------------
-- GUC helper for <% typo path (required by campground_text_matches)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campground_search_prepare()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Required by public.campground_text_matches <% operator (default GUC is 0.6).
  -- is_local=true scopes to this transaction / function call stack.
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.45', true);
END;
$$;

COMMENT ON FUNCTION public.campground_search_prepare() IS
  'SET LOCAL pg_trgm.word_similarity_threshold=0.45 for campground_text_matches <% (#24). Call before any query using that helper.';

REVOKE ALL ON FUNCTION public.campground_search_prepare() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campground_search_prepare() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.campground_text_matches(text, text, text, text, text) IS
  'Guest text match (inlineable): unaccent ILIKE on indexed exprs; <% typo path. Callers MUST run public.campground_search_prepare() first so word_similarity_threshold=0.45 (#24/#39).';

-- Wire prepare into list / near / suggest (replace inline set_config).
CREATE OR REPLACE FUNCTION public.search_campgrounds(
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_amps smallint[] DEFAULT NULL,
  require_water boolean DEFAULT false,
  require_sewer boolean DEFAULT false,
  require_dump_station boolean DEFAULT false,
  require_driveway_type text DEFAULT NULL,
  min_rig_length numeric DEFAULT NULL,
  stay_kind text DEFAULT NULL,
  sort_key text DEFAULT 'name',
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  address text,
  city text,
  province text,
  country text,
  website text,
  phone text,
  latitude double precision,
  longitude double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sort text;
  v_limit integer;
BEGIN
  PERFORM public.campground_search_prepare();

  v_sort := CASE
    WHEN lower(btrim(coalesce(sort_key, 'name'))) IN (
      'name', 'name-desc', 'city', 'province'
    ) THEN lower(btrim(sort_key))
    ELSE 'name'
  END;
  v_limit := least(greatest(coalesce(result_limit, 200), 1), 201);

  RETURN QUERY
  WITH params AS (
    SELECT
      nullif(left(btrim(coalesce(q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(q, '')), 100),
              '\',
              '\\'
            ),
            '%',
            '\%'
          ),
          '_',
          '\_'
        ),
        ''
      ) AS q_pat,
      CASE
        WHEN province_aliases IS NULL THEN NULL
        WHEN cardinality(province_aliases) = 0 THEN ARRAY[]::text[]
        WHEN cardinality(province_aliases) > 32 THEN ARRAY[]::text[]
        ELSE coalesce(
          (
            SELECT array_agg(lower(btrim(a)))
            FROM unnest(province_aliases) AS a
            WHERE btrim(a) <> ''
              AND char_length(btrim(a)) <= 100
          ),
          ARRAY[]::text[]
        )
      END AS province_aliases_norm,
      n.amps_filter,
      n.required_codes,
      coalesce(require_dump_station, false) AS require_dump,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm
    FROM public.normalize_campground_site_filter_params(
      require_amps,
      require_water,
      require_sewer,
      require_driveway_type,
      min_rig_length,
      stay_kind
    ) AS n
  )
  SELECT
    c.id,
    c.name,
    c.description,
    c.address,
    c.city,
    c.province,
    c.country,
    c.website,
    c.phone,
    CASE
      WHEN c.location IS NULL THEN NULL
      ELSE public.st_y(c.location::public.geometry)
    END AS latitude,
    CASE
      WHEN c.location IS NULL THEN NULL
      ELSE public.st_x(c.location::public.geometry)
    END AS longitude
  FROM public.campgrounds AS c
  CROSS JOIN params AS p
  WHERE c.active = true
    AND public.campground_text_matches(c.name, c.city, c.province, p.q_pat, p.q_raw)
    AND (
      p.province_aliases_norm IS NULL
      OR lower(btrim(c.province)) = ANY (p.province_aliases_norm)
    )
    AND (
      NOT p.require_dump
      OR EXISTS (
        SELECT 1
        FROM public.campground_amenities AS ca
        JOIN public.amenities AS am ON am.id = ca.amenity_id
        WHERE ca.campground_id = c.id
          AND am.code = 'DUMP_STATION'
      )
    )
    AND (
      (
        cardinality(p.amps_filter) = 0
        AND cardinality(p.required_codes) = 0
        AND p.driveway_filter IS NULL
        AND p.min_rig IS NULL
        AND p.stay_kind_norm IS NULL
      )
      OR public.campground_has_matching_site(
        c.id,
        p.amps_filter,
        p.required_codes,
        p.driveway_filter,
        p.min_rig,
        p.stay_kind_norm
      )
    )
  ORDER BY
    CASE WHEN v_sort = 'city' THEN lower(coalesce(c.city, '')) END ASC NULLS LAST,
    CASE WHEN v_sort = 'province' THEN lower(coalesce(c.province, '')) END ASC NULLS LAST,
    CASE WHEN v_sort = 'name-desc' THEN lower(c.name) END DESC NULLS LAST,
    lower(c.name) ASC,
    c.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text, integer
) IS
  'Guest list search: unaccent/<% + site filters; ORDER BY sort_key,id; LIMIT ≤201 (app uses 200+1 for truncation) (#24/#39).';

-- suggest: use prepare()
CREATE OR REPLACE FUNCTION public.suggest_campgrounds(
  q text,
  result_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  province text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lim integer;
BEGIN
  PERFORM public.campground_search_prepare();
  v_lim := least(greatest(coalesce(result_limit, 8), 1), 20);

  RETURN QUERY
  WITH params AS (
    SELECT
      nullif(left(btrim(coalesce(suggest_campgrounds.q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(suggest_campgrounds.q, '')), 100),
              '\',
              '\\'
            ),
            '%',
            '\%'
          ),
          '_',
          '\_'
        ),
        ''
      ) AS q_pat
  )
  SELECT
    c.id,
    c.name,
    c.city,
    c.province
  FROM public.campgrounds AS c
  CROSS JOIN params AS p
  WHERE c.active = true
    AND p.q_pat IS NOT NULL
    AND char_length(p.q_raw) >= 3
    AND public.campground_text_matches(c.name, c.city, c.province, p.q_pat, p.q_raw)
  ORDER BY
    extensions.word_similarity(
      public.immutable_unaccent(p.q_raw),
      public.immutable_unaccent(c.name)
    ) DESC,
    c.name ASC,
    c.id ASC
  LIMIT v_lim;
END;
$$;

-- near: use prepare() — body unchanged aside from that
CREATE OR REPLACE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_amps smallint[] DEFAULT NULL,
  require_water boolean DEFAULT false,
  require_sewer boolean DEFAULT false,
  require_dump_station boolean DEFAULT false,
  require_driveway_type text DEFAULT NULL,
  min_rig_length numeric DEFAULT NULL,
  stay_kind text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  address text,
  city text,
  province text,
  country text,
  website text,
  phone text,
  latitude double precision,
  longitude double precision,
  distance_m double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.campground_search_prepare();

  RETURN QUERY
  WITH params AS (
    SELECT
      search_campgrounds_near.lat AS lat,
      search_campgrounds_near.lng AS lng,
      search_campgrounds_near.radius_m AS radius_raw,
      nullif(left(btrim(coalesce(search_campgrounds_near.q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(search_campgrounds_near.q, '')), 100),
              '\',
              '\\'
            ),
            '%',
            '\%'
          ),
          '_',
          '\_'
        ),
        ''
      ) AS q_pat,
      CASE
        WHEN search_campgrounds_near.province_aliases IS NULL THEN NULL
        WHEN cardinality(search_campgrounds_near.province_aliases) = 0 THEN ARRAY[]::text[]
        WHEN cardinality(search_campgrounds_near.province_aliases) > 32 THEN ARRAY[]::text[]
        ELSE coalesce(
          (
            SELECT array_agg(lower(btrim(a)))
            FROM unnest(search_campgrounds_near.province_aliases) AS a
            WHERE btrim(a) <> ''
              AND char_length(btrim(a)) <= 100
          ),
          ARRAY[]::text[]
        )
      END AS province_aliases_norm,
      n.amps_filter,
      n.required_codes,
      coalesce(search_campgrounds_near.require_dump_station, false) AS require_dump,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm
    FROM public.normalize_campground_site_filter_params(
      search_campgrounds_near.require_amps,
      search_campgrounds_near.require_water,
      search_campgrounds_near.require_sewer,
      search_campgrounds_near.require_driveway_type,
      search_campgrounds_near.min_rig_length,
      search_campgrounds_near.stay_kind
    ) AS n
  ),
  origin AS (
    SELECT
      public.ST_SetSRID(
        public.ST_MakePoint(p.lng, p.lat),
        4326
      )::public.geography AS geog,
      least(greatest(p.radius_raw, 0), 200000) AS radius_m,
      p.q_pat,
      p.q_raw,
      p.province_aliases_norm,
      p.amps_filter,
      p.required_codes,
      p.require_dump,
      p.driveway_filter,
      p.min_rig,
      p.stay_kind_norm
    FROM params AS p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      AND p.radius_raw IS NOT NULL
      AND p.lat NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      AND p.lng NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      AND p.radius_raw NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      AND p.lat BETWEEN -90 AND 90
      AND p.lng BETWEEN -180 AND 180
      AND NOT (p.lat = 0 AND p.lng = 0)
  )
  SELECT
    c.id,
    c.name,
    c.description,
    c.address,
    c.city,
    c.province,
    c.country,
    c.website,
    c.phone,
    public.st_y(c.location::public.geometry) AS latitude,
    public.st_x(c.location::public.geometry) AS longitude,
    public.ST_Distance(c.location, o.geog) AS distance_m
  FROM public.campgrounds AS c
  CROSS JOIN origin AS o
  WHERE c.active = true
    AND c.location IS NOT NULL
    AND public.ST_DWithin(c.location, o.geog, o.radius_m)
    AND public.campground_text_matches(c.name, c.city, c.province, o.q_pat, o.q_raw)
    AND (
      o.province_aliases_norm IS NULL
      OR lower(btrim(c.province)) = ANY (o.province_aliases_norm)
    )
    AND (
      NOT o.require_dump
      OR EXISTS (
        SELECT 1
        FROM public.campground_amenities AS ca
        JOIN public.amenities AS am ON am.id = ca.amenity_id
        WHERE ca.campground_id = c.id
          AND am.code = 'DUMP_STATION'
      )
    )
    AND (
      (
        cardinality(o.amps_filter) = 0
        AND cardinality(o.required_codes) = 0
        AND o.driveway_filter IS NULL
        AND o.min_rig IS NULL
        AND o.stay_kind_norm IS NULL
      )
      OR public.campground_has_matching_site(
        c.id,
        o.amps_filter,
        o.required_codes,
        o.driveway_filter,
        o.min_rig,
        o.stay_kind_norm
      )
    )
  ORDER BY distance_m ASC, c.name ASC, c.id ASC
  LIMIT 200;
END;
$$;

-- ---------------------------------------------------------------------------
-- Harden rate-limit / circuit: revoke public call surface; hard-coded admit RPC
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.geocode_rate_limit_take(text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geocode_rate_limit_take(text, double precision, double precision)
  TO service_role;

REVOKE ALL ON FUNCTION public.photon_circuit_is_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photon_circuit_is_open() TO service_role;

REVOKE ALL ON FUNCTION public.photon_circuit_record_success() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photon_circuit_record_success() TO service_role;

REVOKE ALL ON FUNCTION public.photon_circuit_record_failure(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photon_circuit_record_failure(integer, integer)
  TO service_role;

-- Internal take with hard-coded caps when key matches known prefixes.
CREATE OR REPLACE FUNCTION public._geocode_rate_limit_take_fixed(
  p_key text,
  p_capacity double precision,
  p_refill_per_ms double precision
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_tokens double precision;
  v_updated timestamptz;
  v_elapsed_ms double precision;
BEGIN
  v_key := left(btrim(coalesce(p_key, '')), 200);
  IF v_key = '' THEN
    RETURN false;
  END IF;

  -- Ensure row exists (race-safe), then lock.
  INSERT INTO public.geocode_rate_buckets (bucket_key, tokens, updated_at)
  VALUES (v_key, p_capacity, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT b.tokens, b.updated_at
  INTO v_tokens, v_updated
  FROM public.geocode_rate_buckets AS b
  WHERE b.bucket_key = v_key
  FOR UPDATE;

  v_elapsed_ms := GREATEST(
    0,
    EXTRACT(EPOCH FROM (v_now - v_updated)) * 1000.0
  );
  v_tokens := LEAST(p_capacity, v_tokens + v_elapsed_ms * p_refill_per_ms);

  IF v_tokens < 1 THEN
    UPDATE public.geocode_rate_buckets
    SET tokens = v_tokens, updated_at = v_now
    WHERE bucket_key = v_key;
    RETURN false;
  END IF;

  UPDATE public.geocode_rate_buckets
  SET tokens = v_tokens - 1, updated_at = v_now
  WHERE bucket_key = v_key;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._geocode_rate_limit_take_fixed(text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._geocode_rate_limit_take_fixed(text, double precision, double precision)
  TO service_role;

-- Single admit: circuit + IP-first + upstream. Caps hard-coded in SQL.
CREATE OR REPLACE FUNCTION public.photon_proxy_admit(p_client_key text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client text;
  -- Hard-coded: IP ~1/500ms burst 8; upstream ~10/s burst 40.
  v_ip_cap constant double precision := 8;
  v_ip_refill constant double precision := 1.0 / 500.0;
  v_up_cap constant double precision := 40;
  v_up_refill constant double precision := 1.0 / 100.0;
BEGIN
  -- Opportunistic cleanup (no pg_cron): drop idle IP buckets (>1h).
  DELETE FROM public.geocode_rate_buckets
  WHERE bucket_key LIKE 'photon:ip:%'
    AND updated_at < clock_timestamp() - interval '1 hour';

  IF EXISTS (
    SELECT 1
    FROM public.photon_circuit_state AS s
    WHERE s.id = 1
      AND s.open_until IS NOT NULL
      AND s.open_until > clock_timestamp()
  ) THEN
    RETURN 'circuit_open';
  END IF;

  v_client := nullif(left(btrim(coalesce(p_client_key, '')), 200), '');
  IF v_client IS NOT NULL THEN
    -- Only allow photon:ip:* keys from callers (prefix lock-down).
    IF v_client NOT LIKE 'photon:ip:%' THEN
      RETURN 'limited';
    END IF;
    IF NOT public._geocode_rate_limit_take_fixed(v_client, v_ip_cap, v_ip_refill) THEN
      RETURN 'limited';
    END IF;
  END IF;

  IF NOT public._geocode_rate_limit_take_fixed(
    'photon:upstream',
    v_up_cap,
    v_up_refill
  ) THEN
    RETURN 'limited';
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.photon_proxy_admit(text) IS
  'Service-role Photon gate: circuit + IP-first + upstream (hard-coded caps). Returns ok|circuit_open|limited (#24/#39).';

REVOKE ALL ON FUNCTION public.photon_proxy_admit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photon_proxy_admit(text) TO service_role;

-- Circuit success: no-op write when already clear (skip hot-path churn).
CREATE OR REPLACE FUNCTION public.photon_circuit_record_success()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.photon_circuit_state
  SET failure_count = 0, open_until = NULL
  WHERE id = 1
    AND (failure_count <> 0 OR open_until IS NOT NULL);
END;
$$;

-- Circuit failure: hard-coded threshold=3, open_ms=30000 (ignore caller params).
CREATE OR REPLACE FUNCTION public.photon_circuit_record_failure(
  p_threshold integer DEFAULT 3,
  p_open_ms integer DEFAULT 30000
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  -- Hard-coded; parameters retained for signature compat but ignored.
  v_threshold constant integer := 3;
  v_open_ms constant integer := 30000;
BEGIN
  UPDATE public.photon_circuit_state
  SET failure_count = failure_count + 1
  WHERE id = 1
  RETURNING failure_count INTO v_count;

  IF NOT FOUND THEN
    INSERT INTO public.photon_circuit_state (id, failure_count, open_until)
    VALUES (1, 1, NULL)
    RETURNING failure_count INTO v_count;
  END IF;

  IF v_count >= v_threshold THEN
    UPDATE public.photon_circuit_state
    SET failure_count = 0,
        open_until = clock_timestamp() + make_interval(secs => v_open_ms / 1000.0)
    WHERE id = 1;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.photon_circuit_record_failure(integer, integer) IS
  'Service-role only. Hard-coded threshold=3 / open=30s (args ignored) (#24/#39).';
