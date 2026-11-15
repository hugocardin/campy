-- Follow-up to search_campgrounds_hookup_filters:
-- 1) Remove demo site_amenities inserted by that migration (not real hookups).
-- 2) Per-site AND semantics (one site must have every selected code).
-- 3) Drop ambiguous search_campgrounds_near(province text) overload.
-- 4) Protect ELECTRICITY/WATER/SEWER amenity codes from rename/delete.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Undo demo site_amenities (codes remain; demo links → supabase/seed.sql)
-- ---------------------------------------------------------------------------
DELETE FROM public.site_amenities AS sa
USING public.amenities AS a
WHERE sa.amenity_id = a.id
  AND a.code IN ('ELECTRICITY', 'WATER', 'SEWER');

-- ---------------------------------------------------------------------------
-- 2) Protect hookup amenity codes (defense in depth with admin action guard)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_hookup_amenity_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.code IN ('ELECTRICITY', 'WATER', 'SEWER') THEN
      RAISE EXCEPTION 'hookup amenity code % is protected', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.code IN ('ELECTRICITY', 'WATER', 'SEWER')
       AND NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'hookup amenity code % cannot be renamed', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.code IN ('ELECTRICITY', 'WATER', 'SEWER')
       AND OLD.code IS DISTINCT FROM NEW.code THEN
      RAISE EXCEPTION 'cannot rename amenity to protected hookup code %', NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_hookup_amenity_codes ON public.amenities;

CREATE TRIGGER protect_hookup_amenity_codes
  BEFORE UPDATE OR DELETE ON public.amenities
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_hookup_amenity_codes();

COMMENT ON FUNCTION public.protect_hookup_amenity_codes() IS
  'Refuse rename/delete of ELECTRICITY/WATER/SEWER (guest search hookup filters).';

-- ---------------------------------------------------------------------------
-- 3) Drop province text overload (app uses province_aliases only)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text
);

-- ---------------------------------------------------------------------------
-- 4) Replace list + near RPCs: single-site AND over required codes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_campgrounds(
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
      array_remove(
        ARRAY[
          CASE WHEN coalesce(search_campgrounds.require_electricity, false)
            THEN 'ELECTRICITY' END,
          CASE WHEN coalesce(search_campgrounds.require_water, false)
            THEN 'WATER' END,
          CASE WHEN coalesce(search_campgrounds.require_sewer, false)
            THEN 'SEWER' END
        ],
        NULL
      ) AS required_codes
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
      cardinality(p.required_codes) = 0
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = ANY (p.required_codes)
        GROUP BY s.id
        HAVING count(DISTINCT am.code) = cardinality(p.required_codes)
      )
    );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) IS
  'Guest non-geo search: q + province_aliases + per-site ELECTRICITY/WATER/SEWER AND (one site has all selected); no LIMIT (app sorts); SECURITY INVOKER.';

CREATE OR REPLACE FUNCTION public.search_campgrounds_near(
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
      array_remove(
        ARRAY[
          CASE WHEN coalesce(search_campgrounds_near.require_electricity, false)
            THEN 'ELECTRICITY' END,
          CASE WHEN coalesce(search_campgrounds_near.require_water, false)
            THEN 'WATER' END,
          CASE WHEN coalesce(search_campgrounds_near.require_sewer, false)
            THEN 'SEWER' END
        ],
        NULL
      ) AS required_codes
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
      p.required_codes
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
      cardinality(o.required_codes) = 0
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_amenities AS sa ON sa.site_id = s.id
        JOIN public.amenities AS am ON am.id = sa.amenity_id
        WHERE s.campground_id = c.id
          AND am.code = ANY (o.required_codes)
        GROUP BY s.id
        HAVING count(DISTINCT am.code) = cardinality(o.required_codes)
      )
    )
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) IS
  'Guest near-me search: province_aliases + per-site ELECTRICITY/WATER/SEWER AND; no province text overload; SECURITY INVOKER.';

-- Ensure grants remain after CREATE OR REPLACE (same signature)
REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) TO anon, authenticated;

COMMIT;
