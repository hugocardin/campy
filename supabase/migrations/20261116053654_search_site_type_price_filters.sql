-- Issue #24 leftovers: fine site-type filter + min-price filter/sort.
-- Expand same-site matching with site_types[] + max_price; return
-- min_price_per_night from matching sites for cards / price sort.

-- ---------------------------------------------------------------------------
-- Normalize: + require_site_types + max_price
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text
);

CREATE OR REPLACE FUNCTION public.normalize_campground_site_filter_params(
  require_amps smallint[],
  require_water boolean,
  require_sewer boolean,
  require_driveway_type text,
  min_rig_length numeric,
  stay_kind text,
  require_site_types text[] DEFAULT NULL,
  max_price numeric DEFAULT NULL
)
RETURNS TABLE (
  amps_filter smallint[],
  required_codes text[],
  driveway_filter text,
  min_rig numeric,
  stay_kind_norm text,
  site_types_filter text[],
  max_price_norm numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    CASE
      WHEN require_amps IS NULL THEN ARRAY[]::smallint[]
      ELSE coalesce(
        (
          SELECT array_agg(DISTINCT v ORDER BY v)
          FROM unnest(require_amps) AS v
          WHERE v = 0 OR v = ANY (public.electricity_amp_values())
        ),
        ARRAY[]::smallint[]
      )
    END,
    array_remove(
      ARRAY[
        CASE WHEN coalesce(require_water, false) THEN 'WATER' END,
        CASE WHEN coalesce(require_sewer, false) THEN 'SEWER' END
      ],
      NULL
    ),
    CASE
      WHEN require_driveway_type IS NULL THEN NULL
      WHEN upper(btrim(require_driveway_type)) IN ('PULL_THROUGH', 'BACK_IN')
        THEN upper(btrim(require_driveway_type))
      ELSE NULL
    END,
    CASE
      WHEN min_rig_length IS NULL THEN NULL
      WHEN min_rig_length > 0 THEN min_rig_length
      ELSE NULL
    END,
    CASE
      WHEN stay_kind IS NULL THEN NULL
      WHEN lower(btrim(stay_kind)) IN ('camping', 'lodging')
        THEN lower(btrim(stay_kind))
      ELSE NULL
    END,
    CASE
      WHEN require_site_types IS NULL THEN ARRAY[]::text[]
      WHEN cardinality(require_site_types) = 0 THEN ARRAY[]::text[]
      WHEN cardinality(require_site_types) > 16 THEN ARRAY[]::text[]
      ELSE coalesce(
        (
          SELECT array_agg(DISTINCT upper(btrim(c)) ORDER BY upper(btrim(c)))
          FROM unnest(require_site_types) AS c
          WHERE upper(btrim(c)) IN (
            'TENT', 'RV', 'RV_AND_TENT', 'LODGING'
          )
        ),
        ARRAY[]::text[]
      )
    END,
    CASE
      WHEN max_price IS NULL THEN NULL
      WHEN max_price > 0 AND max_price <= 100000 THEN max_price
      ELSE NULL
    END;
$$;

COMMENT ON FUNCTION public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text, text[], numeric
) IS
  'Normalize guest site filters for search RPCs (#24/#27): amps, WATER/SEWER, driveway, rig, stay, site_types, max_price.';

REVOKE ALL ON FUNCTION public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text, text[], numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text, text[], numeric
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Same-site match + min price of matching sites
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text
);

CREATE OR REPLACE FUNCTION public.campground_has_matching_site(
  p_campground_id uuid,
  p_amps_filter smallint[],
  p_required_codes text[],
  p_driveway_filter text,
  p_min_rig numeric,
  p_stay_kind text,
  p_site_types text[] DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
-- No SET search_path: fully-qualified names; omitting SET lets the planner inline.
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
      AND (
        p_site_types IS NULL
        OR cardinality(p_site_types) = 0
        OR st.code = ANY (p_site_types)
      )
      AND (
        p_max_price IS NULL
        OR s.price_per_night_base <= p_max_price
      )
  );
$$;

COMMENT ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) IS
  'Same-site guest filters for search RPCs (#24/#27): amps, WATER/SEWER, driveway, rig, stay, site_types, max_price.';

REVOKE ALL ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.campground_matching_site_min_price(
  p_campground_id uuid,
  p_amps_filter smallint[],
  p_required_codes text[],
  p_driveway_filter text,
  p_min_rig numeric,
  p_stay_kind text,
  p_site_types text[] DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT min(s.price_per_night_base)
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
    AND (
      p_site_types IS NULL
      OR cardinality(p_site_types) = 0
      OR st.code = ANY (p_site_types)
    )
    AND (
      p_max_price IS NULL
      OR s.price_per_night_base <= p_max_price
    );
$$;

COMMENT ON FUNCTION public.campground_matching_site_min_price(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) IS
  'MIN(price_per_night_base) over sites matching guest filters (#24). NULL when no matching site.';

REVOKE ALL ON FUNCTION public.campground_matching_site_min_price(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campground_matching_site_min_price(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_campgrounds: + site_types, max_price, min_price_per_night, price sort
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text, integer
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
  stay_kind text DEFAULT NULL,
  require_site_types text[] DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  sort_key text DEFAULT 'name',
  result_limit integer DEFAULT 200
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
  min_price_per_night numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sort text;
  v_limit integer;
BEGIN
  PERFORM public.campground_search_prepare();

  v_sort := CASE
    WHEN lower(btrim(coalesce(sort_key, 'name'))) IN (
      'name', 'name-desc', 'city', 'province', 'price', 'price-desc'
    ) THEN lower(btrim(sort_key))
    ELSE 'name'
  END;
  -- Cap must stay ≥ app SEARCH_CAMPGROUNDS_LIMIT + 1 (see lib/campground-search.ts).
  v_limit := least(greatest(coalesce(result_limit, 200), 1), 500);

  RETURN QUERY
  WITH params AS (
    SELECT
      nullif(left(btrim(coalesce(q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(q, '')), 100),
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
        WHEN province_aliases IS NULL THEN NULL
        WHEN cardinality(province_aliases) = 0 THEN ARRAY[]::text[]
        WHEN cardinality(province_aliases) > 32 THEN ARRAY[]::text[]
        ELSE coalesce(
          (
            SELECT array_agg(lower(btrim(a)))
            FROM unnest(province_aliases) AS a
            WHERE btrim(a) <> ''
              AND char_length(btrim(a)) <= 100
          ),
          ARRAY[]::text[]
        )
      END AS province_aliases_norm,
      n.amps_filter,
      n.required_codes,
      coalesce(require_dump_station, false) AS require_dump,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm
    FROM public.normalize_campground_site_filter_params(
      require_amps,
      require_water,
      require_sewer,
      require_driveway_type,
      min_rig_length,
      stay_kind,
      require_site_types,
      max_price
    ) AS n
  ),
  filtered AS (
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
      END AS longitude,
      public.campground_matching_site_min_price(
        c.id,
        p.amps_filter,
        p.required_codes,
        p.driveway_filter,
        p.min_rig,
        p.stay_kind_norm,
        p.site_types_filter,
        p.max_price_norm
      ) AS min_price_per_night
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
          AND cardinality(p.site_types_filter) = 0
          AND p.max_price_norm IS NULL
        )
        OR public.campground_has_matching_site(
          c.id,
          p.amps_filter,
          p.required_codes,
          p.driveway_filter,
          p.min_rig,
          p.stay_kind_norm,
          p.site_types_filter,
          p.max_price_norm
        )
      )
  )
  SELECT
    f.id,
    f.name,
    f.description,
    f.address,
    f.city,
    f.province,
    f.country,
    f.website,
    f.phone,
    f.latitude,
    f.longitude,
    f.min_price_per_night
  FROM filtered AS f
  ORDER BY
    CASE WHEN v_sort = 'price' THEN f.min_price_per_night END ASC NULLS LAST,
    CASE WHEN v_sort = 'price-desc' THEN f.min_price_per_night END DESC NULLS LAST,
    CASE WHEN v_sort = 'city' THEN lower(coalesce(f.city, '')) END ASC NULLS LAST,
    CASE WHEN v_sort = 'province' THEN lower(coalesce(f.province, '')) END ASC NULLS LAST,
    CASE WHEN v_sort = 'name-desc' THEN lower(f.name) END DESC NULLS LAST,
    lower(f.name) ASC,
    f.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text, integer
) IS
  'Guest list search: unaccent/trigram + site filters + min price; ORDER BY sort_key (incl. price) + LIMIT ≤500 (#24).';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text, integer
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_campgrounds_near: + site_types, max_price, min_price_per_night
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, integer
);

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
  stay_kind text DEFAULT NULL,
  require_site_types text[] DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  result_limit integer DEFAULT 200
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
  distance_m double precision,
  min_price_per_night numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
BEGIN
  PERFORM public.campground_search_prepare();
  -- Cap must stay ≥ app SEARCH_CAMPGROUNDS_LIMIT + 1 (see lib/campground-search.ts).
  v_limit := least(greatest(coalesce(result_limit, 200), 1), 500);

  RETURN QUERY
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
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm
    FROM public.normalize_campground_site_filter_params(
      search_campgrounds_near.require_amps,
      search_campgrounds_near.require_water,
      search_campgrounds_near.require_sewer,
      search_campgrounds_near.require_driveway_type,
      search_campgrounds_near.min_rig_length,
      search_campgrounds_near.stay_kind,
      search_campgrounds_near.require_site_types,
      search_campgrounds_near.max_price
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
      p.stay_kind_norm,
      p.site_types_filter,
      p.max_price_norm
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
    public.ST_Distance(c.location, o.geog) AS distance_m,
    public.campground_matching_site_min_price(
      c.id,
      o.amps_filter,
      o.required_codes,
      o.driveway_filter,
      o.min_rig,
      o.stay_kind_norm,
      o.site_types_filter,
      o.max_price_norm
    ) AS min_price_per_night
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
        AND cardinality(o.site_types_filter) = 0
        AND o.max_price_norm IS NULL
      )
      OR public.campground_has_matching_site(
        c.id,
        o.amps_filter,
        o.required_codes,
        o.driveway_filter,
        o.min_rig,
        o.stay_kind_norm,
        o.site_types_filter,
        o.max_price_norm
      )
    )
  ORDER BY distance_m ASC, c.name ASC, c.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, integer
) IS
  'Guest near search: distance ORDER + site filters + min_price_per_night (#18/#24).';

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, integer
) TO anon, authenticated;
