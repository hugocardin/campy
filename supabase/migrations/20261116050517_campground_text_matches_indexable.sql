-- Issue #24: make campground_text_matches OR branches indexable (GIN trigram).
-- - city/province: match expression indexes (no coalesce on indexed side)
-- - typo path: <% operator + word_similarity_threshold (set in callers)
-- - add province GIN index
-- Applied live as version 20261116050517.

DROP INDEX IF EXISTS public.campgrounds_city_unaccent_trgm_idx;
CREATE INDEX campgrounds_city_unaccent_trgm_idx
  ON public.campgrounds
  USING gin (public.immutable_unaccent(city) extensions.gin_trgm_ops)
  WHERE city IS NOT NULL;

CREATE INDEX IF NOT EXISTS campgrounds_province_unaccent_trgm_idx
  ON public.campgrounds
  USING gin (public.immutable_unaccent(province) extensions.gin_trgm_ops)
  WHERE province IS NOT NULL;

CREATE OR REPLACE FUNCTION public.campground_text_matches(
  p_name text,
  p_city text,
  p_province text,
  p_q_pat text,
  p_q_raw text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
-- No SET search_path: fully-qualified names; omitting SET lets the planner inline.
AS $$
  SELECT
    p_q_pat IS NULL
    OR public.immutable_unaccent(p_name)
         ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    OR (
      p_city IS NOT NULL
      AND public.immutable_unaccent(p_city)
           ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    )
    OR (
      p_province IS NOT NULL
      AND public.immutable_unaccent(p_province)
           ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    )
    OR (
      p_q_raw IS NOT NULL
      AND char_length(p_q_raw) >= 4
      AND (
        public.immutable_unaccent(p_q_raw)
          OPERATOR(extensions.<%) public.immutable_unaccent(p_name)
        OR (
          p_city IS NOT NULL
          AND public.immutable_unaccent(p_q_raw)
            OPERATOR(extensions.<%) public.immutable_unaccent(p_city)
        )
      )
    );
$$;

COMMENT ON FUNCTION public.campground_text_matches(text, text, text, text, text) IS
  'Guest text match (inlineable): unaccent ILIKE on indexed exprs; <% typo path (threshold via caller SET LOCAL) (#24).';

-- suggest: SET LOCAL threshold so <% uses 0.45; keep word_similarity for ORDER BY.
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
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.45', true);
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
    c.name ASC
  LIMIT v_lim;
END;
$$;

COMMENT ON FUNCTION public.suggest_campgrounds(text, integer) IS
  'Guest autocomplete: active campgrounds by unaccent/<% ; LIMIT 1–20 (#24).';

-- near: SET LOCAL for <% ; preserve live geo validation + LIMIT 200.
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
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.45', true);

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
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean, boolean, text, numeric, text
) IS
  'Guest geo search: radius + unaccent/<% text + site filters; ORDER BY distance LIMIT 200 (#24).';
