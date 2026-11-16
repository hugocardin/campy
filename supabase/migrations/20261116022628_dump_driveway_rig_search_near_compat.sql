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
      ) AS required_codes,
      coalesce(search_campgrounds_near.require_dump_station, false) AS require_dump,
      CASE
        WHEN search_campgrounds_near.require_driveway_type IS NULL THEN NULL
        WHEN upper(btrim(search_campgrounds_near.require_driveway_type))
          IN ('PULL_THROUGH', 'BACK_IN')
          THEN upper(btrim(search_campgrounds_near.require_driveway_type))
        ELSE NULL
      END AS driveway_filter,
      CASE
        WHEN search_campgrounds_near.min_rig_length IS NULL THEN NULL
        WHEN search_campgrounds_near.min_rig_length > 0
          THEN search_campgrounds_near.min_rig_length
        ELSE NULL
      END AS min_rig,
      CASE
        WHEN search_campgrounds_near.stay_kind IS NULL THEN NULL
        WHEN lower(btrim(search_campgrounds_near.stay_kind)) IN ('camping', 'lodging')
          THEN lower(btrim(search_campgrounds_near.stay_kind))
        ELSE NULL
      END AS stay_kind_norm
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
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_types AS st ON st.id = s.site_type_id
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
          AND (
            o.driveway_filter IS NULL
            OR s.driveway_type = o.driveway_filter
          )
          AND (
            o.min_rig IS NULL
            OR (
              s.max_rig_length IS NOT NULL
              AND s.max_rig_length >= o.min_rig
            )
          )
          AND (
            o.stay_kind_norm IS NULL
            OR (
              o.stay_kind_norm = 'lodging'
              AND st.code = 'LODGING'
            )
            OR (
              o.stay_kind_norm = 'camping'
              AND st.code <> 'LODGING'
            )
          )
      )
    )
  ORDER BY distance_m ASC, c.name ASC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean, boolean, text, numeric, text
) IS
  'Guest near-me search: park dump + per-site amps/WATER/SEWER/driveway/rig/stay; SECURITY INVOKER.';

-- Compat wrappers (no DEFAULTs) → new main with dump/driveway/rig/stay defaults.
CREATE FUNCTION public.search_campgrounds(
  q text,
  province_aliases text[],
  require_electricity boolean,
  require_water boolean,
  require_sewer boolean
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
    require_sewer,
    false,
    NULL::text,
    NULL::numeric,
    NULL::text
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps. Drop after amps app deploys — #30.';

CREATE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text,
  province_aliases text[],
  require_electricity boolean,
  require_water boolean,
  require_sewer boolean
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
    require_sewer,
    false,
    NULL::text,
    NULL::numeric,
    NULL::text
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps. Drop after amps app deploys — #30.';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean, boolean, text, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean, boolean, text, numeric, text
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) TO anon, authenticated;
