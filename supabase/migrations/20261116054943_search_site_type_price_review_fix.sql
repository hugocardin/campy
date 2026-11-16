-- PR #40 review follow-up (#24):
-- 1) Single site-match source of truth (has_matching → min_price IS NOT NULL)
-- 2) Validate require_site_types against site_types table
-- 3) Defer min_price to post-LIMIT when not filtering/sorting by price
-- 4) Document CAD / base-price policy on sites.price_per_night_base

COMMENT ON COLUMN public.sites.price_per_night_base IS
  'Nightly base price in CAD (MVP policy; multi-currency later). '
  'Guest search maxPrice / min_price_per_night ignore pricing_rules jsonb '
  '(date-aware effective price is Phase D).';

-- ---------------------------------------------------------------------------
-- Normalize: site types from table; comment on >16 fail-open
-- ---------------------------------------------------------------------------
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
      -- Oversized input disables the filter (abuse / DoS), not an error.
      WHEN cardinality(require_site_types) > 16 THEN ARRAY[]::text[]
      ELSE coalesce(
        (
          SELECT array_agg(DISTINCT upper(btrim(c)) ORDER BY upper(btrim(c)))
          FROM unnest(require_site_types) AS c
          WHERE EXISTS (
            SELECT 1
            FROM public.site_types AS st
            WHERE st.code = upper(btrim(c))
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
  'Normalize guest site filters (#24/#27/#40). Site types validated against site_types; >16 codes clears the filter.';

-- ---------------------------------------------------------------------------
-- has_matching: thin wrapper over min_price (one WHERE clause to maintain)
-- ---------------------------------------------------------------------------
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
AS $$
  SELECT public.campground_matching_site_min_price(
    p_campground_id,
    p_amps_filter,
    p_required_codes,
    p_driveway_filter,
    p_min_rig,
    p_stay_kind,
    p_site_types,
    p_max_price
  ) IS NOT NULL;
$$;

COMMENT ON FUNCTION public.campground_has_matching_site(
  uuid, smallint[], text[], text, numeric, text, text[], numeric
) IS
  'True iff campground_matching_site_min_price is non-NULL (price_per_night_base NOT NULL). Single match predicate (#40).';

-- ---------------------------------------------------------------------------
-- search_campgrounds: defer min_price when not needed for filter/sort
-- ---------------------------------------------------------------------------
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
  v_site_filters boolean;
BEGIN
  PERFORM public.campground_search_prepare();

  v_sort := CASE
    WHEN lower(btrim(coalesce(sort_key, 'name'))) IN (
      'name', 'name-desc', 'city', 'province', 'price', 'price-desc'
    ) THEN lower(btrim(sort_key))
    ELSE 'name'
  END;
  v_limit := least(greatest(coalesce(result_limit, 200), 1), 500);

  -- Need min_price before ORDER BY/LIMIT when sorting by price or filtering sites
  -- (has_matching ≡ min_price IS NOT NULL). Otherwise attach price after LIMIT.
  SELECT
    cardinality(n.amps_filter) > 0
    OR cardinality(n.required_codes) > 0
    OR n.driveway_filter IS NOT NULL
    OR n.min_rig IS NOT NULL
    OR n.stay_kind_norm IS NOT NULL
    OR cardinality(n.site_types_filter) > 0
    OR n.max_price_norm IS NOT NULL
  INTO v_site_filters
  FROM public.normalize_campground_site_filter_params(
    require_amps,
    require_water,
    require_sewer,
    require_driveway_type,
    min_rig_length,
    stay_kind,
    require_site_types,
    max_price
  ) AS n;

  IF v_site_filters OR v_sort IN ('price', 'price-desc') THEN
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
    priced AS (
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
    ),
    filtered AS (
      SELECT *
      FROM priced AS pr
      WHERE NOT v_site_filters
        OR pr.min_price_per_night IS NOT NULL
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
  ELSE
    -- No site filters + non-price sort: LIMIT first, then min_price on the page.
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
        coalesce(require_dump_station, false) AS require_dump
    ),
    limited AS (
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
      ORDER BY
        CASE WHEN v_sort = 'city' THEN lower(coalesce(c.city, '')) END ASC NULLS LAST,
        CASE WHEN v_sort = 'province' THEN lower(coalesce(c.province, '')) END ASC NULLS LAST,
        CASE WHEN v_sort = 'name-desc' THEN lower(c.name) END DESC NULLS LAST,
        lower(c.name) ASC,
        c.id ASC
      LIMIT v_limit
    )
    SELECT
      l.id,
      l.name,
      l.description,
      l.address,
      l.city,
      l.province,
      l.country,
      l.website,
      l.phone,
      l.latitude,
      l.longitude,
      public.campground_matching_site_min_price(
        l.id,
        ARRAY[]::smallint[],
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        ARRAY[]::text[],
        NULL
      ) AS min_price_per_night
    FROM limited AS l
    ORDER BY
      CASE WHEN v_sort = 'city' THEN lower(coalesce(l.city, '')) END ASC NULLS LAST,
      CASE WHEN v_sort = 'province' THEN lower(coalesce(l.province, '')) END ASC NULLS LAST,
      CASE WHEN v_sort = 'name-desc' THEN lower(l.name) END DESC NULLS LAST,
      lower(l.name) ASC,
      l.id ASC;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text, integer
) IS
  'Guest list search (#24/#40): min_price once when site-filtering or price-sorting; else post-LIMIT. sites(campground_id) indexed.';

-- ---------------------------------------------------------------------------
-- search_campgrounds_near: one min_price call; filter via IS NOT NULL
-- ---------------------------------------------------------------------------
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
  v_site_filters boolean;
BEGIN
  PERFORM public.campground_search_prepare();
  v_limit := least(greatest(coalesce(result_limit, 200), 1), 500);

  SELECT
    cardinality(n.amps_filter) > 0
    OR cardinality(n.required_codes) > 0
    OR n.driveway_filter IS NOT NULL
    OR n.min_rig IS NOT NULL
    OR n.stay_kind_norm IS NOT NULL
    OR cardinality(n.site_types_filter) > 0
    OR n.max_price_norm IS NOT NULL
  INTO v_site_filters
  FROM public.normalize_campground_site_filter_params(
    require_amps,
    require_water,
    require_sewer,
    require_driveway_type,
    min_rig_length,
    stay_kind,
    require_site_types,
    max_price
  ) AS n;

  IF v_site_filters THEN
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
    ),
    priced AS (
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
    )
    SELECT
      pr.id,
      pr.name,
      pr.description,
      pr.address,
      pr.city,
      pr.province,
      pr.country,
      pr.website,
      pr.phone,
      pr.latitude,
      pr.longitude,
      pr.distance_m,
      pr.min_price_per_night
    FROM priced AS pr
    WHERE pr.min_price_per_night IS NOT NULL
    ORDER BY pr.distance_m ASC, pr.name ASC, pr.id ASC
    LIMIT v_limit;
  ELSE
    -- No site filters: distance LIMIT first, then min_price on the page.
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
        coalesce(search_campgrounds_near.require_dump_station, false) AS require_dump
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
        p.require_dump
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
    ),
    limited AS (
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
      ORDER BY distance_m ASC, c.name ASC, c.id ASC
      LIMIT v_limit
    )
    SELECT
      l.id,
      l.name,
      l.description,
      l.address,
      l.city,
      l.province,
      l.country,
      l.website,
      l.phone,
      l.latitude,
      l.longitude,
      l.distance_m,
      public.campground_matching_site_min_price(
        l.id,
        ARRAY[]::smallint[],
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        ARRAY[]::text[],
        NULL
      ) AS min_price_per_night
    FROM limited AS l
    ORDER BY l.distance_m ASC, l.name ASC, l.id ASC;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, integer
) IS
  'Guest near search (#18/#24/#40): single min_price_per_night; site filter via IS NOT NULL.';
