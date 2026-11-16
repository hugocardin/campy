-- Guest search: electricity / water / sewer via site-level amenity codes.
-- Expand/contract: drop prior list/near aliases signatures; recreate with
-- require_* boolean defaults so named-arg callers (q, province_aliases) keep working.
-- Compat near-me `province text` overload retained (calls expanded aliases fn).

-- Stable catalog codes for hookup filters (existing amenities table — not new lookups).
INSERT INTO public.amenities (code, category_id)
SELECT v.code, ac.id
FROM (
  VALUES
    ('ELECTRICITY'),
    ('WATER'),
    ('SEWER')
) AS v(code)
CROSS JOIN public.amenity_categories AS ac
WHERE ac.code = 'SERVICES'
ON CONFLICT (code) DO NOTHING;

-- Demo site links so filters are exercisable on active parks (idempotent).
INSERT INTO public.site_amenities (site_id, amenity_id)
SELECT s.id, a.id
FROM public.sites AS s
JOIN public.campgrounds AS c ON c.id = s.campground_id
JOIN public.amenities AS a ON a.code IN ('ELECTRICITY', 'WATER', 'SEWER')
WHERE (c.name, s.name, a.code) IN (
  ('Alice Lake Provincial Park', 'AL-1', 'ELECTRICITY'),
  ('Alice Lake Provincial Park', 'AL-1', 'WATER'),
  ('Alice Lake Provincial Park', 'AL-1', 'SEWER'),
  ('Alice Lake Provincial Park', 'AL-12', 'ELECTRICITY'),
  ('Green Point Campground – Pacific Rim', 'GP-21', 'ELECTRICITY'),
  ('Green Point Campground – Pacific Rim', 'GP-21', 'WATER'),
  ('Emerald Lake Campground', 'E-2', 'WATER'),
  ('Gold Creek Campground – Golden Ears', 'A2', 'SEWER')
)
ON CONFLICT (site_id, amenity_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.search_campgrounds(text, text[]);

CREATE FUNCTION public.search_campgrounds(
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_electricity boolean DEFAULT false,
  require_water boolean DEFAULT false,
  require_sewer boolean DEFAULT false
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
      coalesce(search_campgrounds.require_electricity, false) AS require_electricity,
      coalesce(search_campgrounds.require_water, false) AS require_water,
      coalesce(search_campgrounds.require_sewer, false) AS require_sewer
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
    AND (
      p.q_pat IS NULL
      OR c.name ILIKE '%' || p.q_pat || '%' ESCAPE '\'
      OR c.city ILIKE '%' || p.q_pat || '%' ESCAPE '\'
      OR c.province ILIKE '%' || p.q_pat || '%' ESCAPE '\'
    )
    AND (
      p.province_aliases_norm IS NULL
      OR lower(btrim(c.province)) = ANY (p.province_aliases_norm)
    )
    AND (
      NOT p.require_electricity
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'ELECTRICITY'
      )
    )
    AND (
      NOT p.require_water
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'WATER'
      )
    )
    AND (
      NOT p.require_sewer
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'SEWER'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) IS
  'Guest non-geo search: q ILIKE + province_aliases (lower(btrim), max 32×100 fail closed) + site-level ELECTRICITY/WATER/SEWER amenity AND filters; no LIMIT (app sorts); SECURITY INVOKER.';

DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[]
);

CREATE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_electricity boolean DEFAULT false,
  require_water boolean DEFAULT false,
  require_sewer boolean DEFAULT false
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
      coalesce(search_campgrounds_near.require_electricity, false) AS require_electricity,
      coalesce(search_campgrounds_near.require_water, false) AS require_water,
      coalesce(search_campgrounds_near.require_sewer, false) AS require_sewer
  ),
  origin AS (
    SELECT
      public.ST_SetSRID(
        public.ST_MakePoint(p.lng, p.lat),
        4326
      )::public.geography AS geog,
      least(greatest(p.radius_raw, 0), 200000) AS radius_m,
      p.q_pat,
      p.province_aliases_norm,
      p.require_electricity,
      p.require_water,
      p.require_sewer
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
      o.province_aliases_norm IS NULL
      OR lower(btrim(c.province)) = ANY (o.province_aliases_norm)
    )
    AND (
      NOT o.require_electricity
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'ELECTRICITY'
      )
    )
    AND (
      NOT o.require_water
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'WATER'
      )
    )
    AND (
      NOT o.require_sewer
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = 'SEWER'
      )
    )
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) IS
  'Guest near-me search: province_aliases + site-level ELECTRICITY/WATER/SEWER amenity AND filters; >32 aliases fail closed; SECURITY INVOKER.';

CREATE OR REPLACE FUNCTION public.search_campgrounds_near(
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
  SELECT *
  FROM public.search_campgrounds_near(
    lat,
    lng,
    radius_m,
    q,
    CASE
      WHEN province IS NULL OR btrim(province) = '' THEN NULL::text[]
      ELSE ARRAY[left(btrim(province), 100)]::text[]
    END,
    false,
    false,
    false
  );
$$;