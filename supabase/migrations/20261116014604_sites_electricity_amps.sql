-- Site-level electricity amps (exact multi-select search) replacing yes/no ELECTRICITY.
-- 1) sites.electricity_amps smallint[] with allowed-values + uniqueness check
-- 2) Backfill from site_amenities ELECTRICITY → {15,20,30,50} ("any amp")
-- 3) Drop ELECTRICITY site_amenities links; protect WATER/SEWER only
-- 4) search_campgrounds / search_campgrounds_near: require_amps smallint[] (0=none)

CREATE OR REPLACE FUNCTION public.electricity_amps_valid(amps smallint[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT
    amps <@ ARRAY[15, 20, 30, 50]::smallint[]
    AND cardinality(amps) = (
      SELECT count(DISTINCT x)::int FROM unnest(amps) AS x
    );
$$;

COMMENT ON FUNCTION public.electricity_amps_valid(smallint[]) IS
  'True when amps is a duplicate-free subset of {15,20,30,50}.';

REVOKE ALL ON FUNCTION public.electricity_amps_valid(smallint[]) FROM PUBLIC;

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS electricity_amps smallint[] NOT NULL DEFAULT '{}'::smallint[];

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_electricity_amps_valid;

ALTER TABLE public.sites
  ADD CONSTRAINT sites_electricity_amps_valid
  CHECK (public.electricity_amps_valid(electricity_amps));

COMMENT ON COLUMN public.sites.electricity_amps IS
  'Available pedestal amps for this site; empty = no electricity. Allowed: 15,20,30,50; no duplicates.';

-- Legacy ELECTRICITY amenity → any amp (guest can refine later in admin).
UPDATE public.sites AS s
SET electricity_amps = ARRAY[15, 20, 30, 50]::smallint[],
    updated_at = now()
FROM public.site_amenities AS sa
JOIN public.amenities AS a ON a.id = sa.amenity_id
WHERE sa.site_id = s.id
  AND a.code = 'ELECTRICITY'
  AND cardinality(s.electricity_amps) = 0;

DELETE FROM public.site_amenities AS sa
USING public.amenities AS a
WHERE sa.amenity_id = a.id
  AND a.code = 'ELECTRICITY';

-- Search no longer keys off ELECTRICITY; keep WATER/SEWER protected.
CREATE OR REPLACE FUNCTION public.protect_hookup_amenity_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.code IN ('WATER', 'SEWER') THEN
      RAISE EXCEPTION 'hookup amenity code % is protected', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.code IN ('WATER', 'SEWER')
       AND NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'hookup amenity code % cannot be renamed', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.code IN ('WATER', 'SEWER')
       AND OLD.code IS DISTINCT FROM NEW.code THEN
      RAISE EXCEPTION 'cannot rename amenity to protected hookup code %', NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_hookup_amenity_codes() IS
  'Refuse rename/delete of WATER/SEWER (guest search hookup filters). ELECTRICITY moved to sites.electricity_amps.';

-- Drop prior boolean electricity overloads (replace with require_amps).
DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], boolean, boolean, boolean
);
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.search_campgrounds(
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_amps smallint[] DEFAULT NULL,
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
      -- Allow only 0 (none) and 15/20/30/50; dedupe. NULL/empty = no amp filter.
      CASE
        WHEN search_campgrounds.require_amps IS NULL THEN ARRAY[]::smallint[]
        ELSE coalesce(
          (
            SELECT array_agg(DISTINCT v ORDER BY v)
            FROM unnest(search_campgrounds.require_amps) AS v
            WHERE v = 0 OR v IN (15, 20, 30, 50)
          ),
          ARRAY[]::smallint[]
        )
      END AS amps_filter,
      array_remove(
        ARRAY[
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
      cardinality(p.amps_filter) = 0
      AND cardinality(p.required_codes) = 0
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        WHERE s.campground_id = c.id
          AND (
            cardinality(p.amps_filter) = 0
            OR (
              (0 = ANY (p.amps_filter) AND cardinality(s.electricity_amps) = 0)
              OR (
                s.electricity_amps
                && array_remove(p.amps_filter, 0::smallint)
              )
            )
          )
          AND (
            cardinality(p.required_codes) = 0
            OR (
              SELECT count(DISTINCT am.code)
              FROM public.site_amenities AS sa
              JOIN public.amenities AS am ON am.id = sa.amenity_id
              WHERE sa.site_id = s.id
                AND am.code = ANY (p.required_codes)
            ) = cardinality(p.required_codes)
          )
      )
    );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
) IS
  'Guest non-geo search: q + province_aliases + per-site amps overlap (0=none) AND WATER/SEWER; no LIMIT (app sorts); SECURITY INVOKER.';

CREATE OR REPLACE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL,
  require_amps smallint[] DEFAULT NULL,
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
      CASE
        WHEN search_campgrounds_near.require_amps IS NULL THEN ARRAY[]::smallint[]
        ELSE coalesce(
          (
            SELECT array_agg(DISTINCT v ORDER BY v)
            FROM unnest(search_campgrounds_near.require_amps) AS v
            WHERE v = 0 OR v IN (15, 20, 30, 50)
          ),
          ARRAY[]::smallint[]
        )
      END AS amps_filter,
      array_remove(
        ARRAY[
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
      p.amps_filter,
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
      cardinality(o.amps_filter) = 0
      AND cardinality(o.required_codes) = 0
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        WHERE s.campground_id = c.id
          AND (
            cardinality(o.amps_filter) = 0
            OR (
              (0 = ANY (o.amps_filter) AND cardinality(s.electricity_amps) = 0)
              OR (
                s.electricity_amps
                && array_remove(o.amps_filter, 0::smallint)
              )
            )
          )
          AND (
            cardinality(o.required_codes) = 0
            OR (
              SELECT count(DISTINCT am.code)
              FROM public.site_amenities AS sa
              JOIN public.amenities AS am ON am.id = sa.amenity_id
              WHERE sa.site_id = s.id
                AND am.code = ANY (o.required_codes)
            ) = cardinality(o.required_codes)
          )
      )
    )
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
) IS
  'Guest near-me search: province_aliases + per-site amps overlap (0=none) AND WATER/SEWER; SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
) TO anon, authenticated;
