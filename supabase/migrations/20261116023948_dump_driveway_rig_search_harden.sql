-- Follow-up to dump/driveway/rig search (#27 / PR #31 review):
-- 1) Replace sites_max_rig_length_by_type CHECK (reads site_types) with a trigger
-- 2) Revoke EXECUTE on site_max_rig_length_valid from API roles
-- 3) Shared campground_has_matching_site helper (list + near stay in sync)
-- 4) Null driveway_type on LODGING sites (cabins; guest filter ignores driveway)

-- ---------------------------------------------------------------------------
-- max_rig: CHECK → trigger
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_max_rig_length_by_type;

CREATE OR REPLACE FUNCTION public.sites_enforce_max_rig_length()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.site_max_rig_length_valid(NEW.site_type_id, NEW.max_rig_length) THEN
    RAISE EXCEPTION
      'max_rig_length invalid for site_type_id % (lodging must be null; RV/RV_AND_TENT require > 0)',
      NEW.site_type_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sites_enforce_max_rig_length() IS
  'BEFORE INSERT/UPDATE: enforce site_max_rig_length_valid (issue #27). Prefer trigger over CHECK that reads site_types.';

DROP TRIGGER IF EXISTS sites_enforce_max_rig_length ON public.sites;
CREATE TRIGGER sites_enforce_max_rig_length
  BEFORE INSERT OR UPDATE OF site_type_id, max_rig_length ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.sites_enforce_max_rig_length();

REVOKE ALL ON FUNCTION public.site_max_rig_length_valid(integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.site_max_rig_length_valid(integer, numeric)
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.sites_enforce_max_rig_length() FROM PUBLIC;

-- Cabins: no driveway type (matches guest UI hide for lodging).
UPDATE public.sites AS s
SET driveway_type = NULL,
    updated_at = now()
FROM public.site_types AS st
WHERE s.site_type_id = st.id
  AND st.code = 'LODGING'
  AND s.driveway_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Shared same-site filter predicate (list + near)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campground_has_matching_site(
  p_campground_id uuid,
  p_amps_filter smallint[],
  p_required_codes text[],
  p_driveway_filter text,
  p_min_rig numeric,
  p_stay_kind text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites AS s
    JOIN public.site_types AS st ON st.id = s.site_type_id
    WHERE s.campground_id = p_campground_id
      AND (
        cardinality(p_amps_filter) = 0
        OR (
          (0 = ANY (p_amps_filter) AND cardinality(s.electricity_amps) = 0)
          OR (
            s.electricity_amps
            && array_remove(p_amps_filter, 0::smallint)
          )
        )
      )
      AND (
        cardinality(p_required_codes) = 0
        OR (
          SELECT count(DISTINCT am.code)
          FROM public.site_amenities AS sa
          JOIN public.amenities AS am ON am.id = sa.amenity_id
          WHERE sa.site_id = s.id
            AND am.code = ANY (p_required_codes)
        ) = cardinality(p_required_codes)
      )
      AND (
        p_driveway_filter IS NULL
        OR s.driveway_type = p_driveway_filter
      )
      AND (
        p_min_rig IS NULL
        OR (
          s.max_rig_length IS NOT NULL
          AND s.max_rig_length >= p_min_rig
        )
      )
      AND (
        p_stay_kind IS NULL
        OR (
          p_stay_kind = 'lodging'
          AND st.code = 'LODGING'
        )
        OR (
          p_stay_kind = 'camping'
          AND st.code <> 'LODGING'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text
) IS
  'Same-site guest filters for search_campgrounds / _near (amps, WATER/SEWER, driveway, rig, stay). Keep in sync with app URL parsers.';

REVOKE ALL ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text
) TO anon, authenticated;

-- Rewrite list RPC to call the helper (body otherwise unchanged).
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
      ) AS required_codes,
      coalesce(search_campgrounds.require_dump_station, false) AS require_dump,
      CASE
        WHEN search_campgrounds.require_driveway_type IS NULL THEN NULL
        WHEN upper(btrim(search_campgrounds.require_driveway_type))
          IN ('PULL_THROUGH', 'BACK_IN')
          THEN upper(btrim(search_campgrounds.require_driveway_type))
        ELSE NULL
      END AS driveway_filter,
      CASE
        WHEN search_campgrounds.min_rig_length IS NULL THEN NULL
        WHEN search_campgrounds.min_rig_length > 0
          THEN search_campgrounds.min_rig_length
        ELSE NULL
      END AS min_rig,
      CASE
        WHEN search_campgrounds.stay_kind IS NULL THEN NULL
        WHEN lower(btrim(search_campgrounds.stay_kind)) IN ('camping', 'lodging')
          THEN lower(btrim(search_campgrounds.stay_kind))
        ELSE NULL
      END AS stay_kind_norm
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
