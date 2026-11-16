-- ---------------------------------------------------------------------------
-- Expand/contract search RPCs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], smallint[], boolean, boolean
);
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  smallint[], boolean, boolean
);

-- Boolean compat must be dropped before recreating mains they call with new arity.
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
      OR EXISTS (
        SELECT 1
        FROM public.sites AS s
        JOIN public.site_types AS st ON st.id = s.site_type_id
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
          AND (
            p.driveway_filter IS NULL
            OR s.driveway_type = p.driveway_filter
          )
          AND (
            p.min_rig IS NULL
            OR (
              s.max_rig_length IS NOT NULL
              AND s.max_rig_length >= p.min_rig
            )
          )
          AND (
            p.stay_kind_norm IS NULL
            OR (
              p.stay_kind_norm = 'lodging'
              AND st.code = 'LODGING'
            )
            OR (
              p.stay_kind_norm = 'camping'
              AND st.code <> 'LODGING'
            )
          )
      )
    );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text
) IS
  'Guest non-geo search: park dump amenity + per-site amps/WATER/SEWER/driveway/rig/stay; no LIMIT; SECURITY INVOKER.';
