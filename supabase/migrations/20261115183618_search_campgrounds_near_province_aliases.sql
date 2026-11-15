-- Match province filter against alias list (app expands code → aliases).
-- Replaces exact `province text` equality with `province_aliases text[]` ILIKE.

BEGIN;

DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
);

CREATE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL
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
        WHEN cardinality(search_campgrounds_near.province_aliases) = 0 THEN NULL
        ELSE (
          SELECT array_agg(btrim(a))
          FROM unnest(search_campgrounds_near.province_aliases) AS a
          WHERE btrim(a) <> ''
        )
      END AS province_aliases
  ),
  origin AS (
    SELECT
      public.ST_SetSRID(
        public.ST_MakePoint(p.lng, p.lat),
        4326
      )::public.geography AS geog,
      least(greatest(p.radius_raw, 0), 200000) AS radius_m,
      p.q_pat,
      p.province_aliases
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
    AND (
      o.q_pat IS NULL
      OR c.name ILIKE '%' || o.q_pat || '%' ESCAPE '\'
      OR c.city ILIKE '%' || o.q_pat || '%' ESCAPE '\'
      OR c.province ILIKE '%' || o.q_pat || '%' ESCAPE '\'
    )
    AND (
      o.province_aliases IS NULL
      OR EXISTS (
        SELECT 1
        FROM unnest(o.province_aliases) AS a(alias)
        WHERE btrim(c.province) ILIKE btrim(a.alias)
      )
    )
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text[]
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text[]
) IS
  'Guest near-me search: province_aliases text[] matched with ILIKE; rejects NaN/±Inf; clamps radius_m 0–200km; cap-then-escape ILIKE; LIMIT 200; SECURITY INVOKER.';

COMMIT;
