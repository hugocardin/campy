-- Issue #24 follow-up: wire unaccent/trigram into search_campgrounds / _near.
-- Depends on 20261116041044 (immutable_unaccent, campground_text_matches).
-- Applied live as version 20261116041147.

CREATE OR REPLACE FUNCTION public.search_campgrounds(
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
  longitude double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      nullif(left(btrim(coalesce(search_campgrounds.q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(search_campgrounds.q, '')), 100),
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
        WHEN search_campgrounds.province_aliases IS NULL THEN NULL
        WHEN cardinality(search_campgrounds.province_aliases) = 0 THEN ARRAY[]::text[]
        WHEN cardinality(search_campgrounds.province_aliases) > 32 THEN ARRAY[]::text[]
        ELSE coalesce(
          (
            SELECT array_agg(lower(btrim(a)))
            FROM unnest(search_campgrounds.province_aliases) AS a
            WHERE btrim(a) <> ''
              AND char_length(btrim(a)) <= 100
          ),
          ARRAY[]::text[]
        )
      END AS province_aliases_norm,
      n.amps_filter,
      n.required_codes,
      coalesce(search_campgrounds.require_dump_station, false) AS require_dump,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm
    FROM public.normalize_campground_site_filter_params(
      search_campgrounds.require_amps,
      search_campgrounds.require_water,
      search_campgrounds.require_sewer,
      search_campgrounds.require_driveway_type,
      search_campgrounds.min_rig_length,
      search_campgrounds.stay_kind
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
    );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text
) IS
  'Guest list search: province_aliases + site filters + unaccent/trigram text (#24); SECURITY INVOKER.';

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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean, boolean, text, numeric, text
) IS
  'Guest near-me search: radius + filters + unaccent/trigram text (#24); LIMIT 200; SECURITY INVOKER.';
