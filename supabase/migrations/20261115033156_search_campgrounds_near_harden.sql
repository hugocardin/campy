-- Harden search_campgrounds_near (follow-up to 20261115032320):
-- * DROP + CREATE — return type changes (SETOF v_campgrounds → explicit TABLE + distance_m)
-- * Explicit guest columns only (no v.* / view dependency for grants)
-- * Clamp radius_m to [0, 200000]; reject non-finite lat/lng/radius
-- * Escape ILIKE wildcards + cap q/province length
-- * ORDER BY distance, LIMIT 200; return distance_m

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
  province text DEFAULT NULL
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
      least(
        greatest(coalesce(search_campgrounds_near.radius_m, 0), 0),
        200000
      ) AS radius_m,
      nullif(
        left(
          replace(
            replace(
              replace(btrim(coalesce(search_campgrounds_near.q, '')), '\', '\\'),
              '%',
              '\%'
            ),
            '_',
            '\_'
          ),
          100
        ),
        ''
      ) AS q_pat,
      nullif(left(btrim(coalesce(search_campgrounds_near.province, '')), 100), '') AS province_eq
  ),
  origin AS (
    SELECT
      public.ST_SetSRID(
        public.ST_MakePoint(p.lng, p.lat),
        4326
      )::public.geography AS geog,
      p.radius_m,
      p.q_pat,
      p.province_eq
    FROM params AS p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      AND p.radius_m IS NOT NULL
      AND p.lat = p.lat  -- reject NaN
      AND p.lng = p.lng
      AND p.radius_m = p.radius_m
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
    AND (o.province_eq IS NULL OR c.province = o.province_eq)
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) IS
  'Guest near-me search: explicit guest columns + distance_m; ST_DWithin with clamped radius_m (0–200km); ILIKE wildcards escaped; LIMIT 200; SECURITY INVOKER.';

COMMIT;
