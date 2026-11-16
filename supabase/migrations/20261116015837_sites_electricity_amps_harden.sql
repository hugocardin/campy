-- Follow-up to 20261116014604_sites_electricity_amps (expand/contract + harden):
-- 1) Single SQL source for allowed amps (CHECK + both search RPCs)
-- 2) Keep electricity_amps_valid executable by writing roles (CHECK uses it)
-- 3) Restore boolean require_electricity overloads as thin wrappers for main until app ships
-- 4) Retire amenities.ELECTRICITY (amps live on sites.electricity_amps)

CREATE OR REPLACE FUNCTION public.electricity_amp_values()
RETURNS smallint[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT ARRAY[15, 20, 30, 50]::smallint[];
$$;

COMMENT ON FUNCTION public.electricity_amp_values() IS
  'Canonical allowed site electricity amps; keep in sync with lib/electricity-amps.ts ELECTRICITY_AMP_VALUES.';

REVOKE ALL ON FUNCTION public.electricity_amp_values() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.electricity_amp_values() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.electricity_amps_valid(amps smallint[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT
    amps <@ public.electricity_amp_values()
    AND cardinality(amps) = (
      SELECT count(DISTINCT x)::int FROM unnest(amps) AS x
    );
$$;

COMMENT ON FUNCTION public.electricity_amps_valid(smallint[]) IS
  'True when amps is a duplicate-free subset of electricity_amp_values(). Must stay EXECUTEable by roles that INSERT/UPDATE sites (CHECK constraint).';

-- Writing roles must EXECUTE this: sites_electricity_amps_valid CHECK calls it.
REVOKE ALL ON FUNCTION public.electricity_amps_valid(smallint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.electricity_amps_valid(smallint[]) TO anon, authenticated;

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
      CASE
        WHEN search_campgrounds.require_amps IS NULL THEN ARRAY[]::smallint[]
        ELSE coalesce(
          (
            SELECT array_agg(DISTINCT v ORDER BY v)
            FROM unnest(search_campgrounds.require_amps) AS v
            WHERE v = 0 OR v = ANY (public.electricity_amp_values())
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
            WHERE v = 0 OR v = ANY (public.electricity_amp_values())
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

-- Compatibility wrappers so main (require_electricity boolean) keeps working until this app deploys.
-- Drop in a later migration after expand/contract completes.
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
  SELECT *
  FROM public.search_campgrounds(
    q,
    province_aliases,
    CASE
      WHEN coalesce(require_electricity, false)
        THEN public.electricity_amp_values()
      ELSE NULL::smallint[]
    END,
    require_water,
    require_sewer
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps=electricity_amp_values(); drop after app uses require_amps only.';

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
  SELECT *
  FROM public.search_campgrounds_near(
    lat,
    lng,
    radius_m,
    q,
    province_aliases,
    CASE
      WHEN coalesce(require_electricity, false)
        THEN public.electricity_amp_values()
      ELSE NULL::smallint[]
    END,
    require_water,
    require_sewer
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps=electricity_amp_values(); drop after app uses require_amps only.';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) TO anon, authenticated;

-- Retire ELECTRICITY amenity; power is sites.electricity_amps.
DELETE FROM public.site_amenities AS sa
USING public.amenities AS a
WHERE sa.amenity_id = a.id
  AND a.code = 'ELECTRICITY';

DELETE FROM public.campground_amenities AS ca
USING public.amenities AS a
WHERE ca.amenity_id = a.id
  AND a.code = 'ELECTRICITY';

DELETE FROM public.amenities
WHERE code = 'ELECTRICITY';
