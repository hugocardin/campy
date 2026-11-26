-- #57: return cover_photo from guest search RPCs (drop enrichCampgroundCovers).
-- Bodies copied verbatim from 20261116220335_campground_currency_price_sort_group_impl.sql;
-- only change: + cover_photo (RETURNS TABLE, base CTE, final SELECT). Grants re-applied after DROP.
-- OUT columns changed → DROP + recreate (CREATE OR REPLACE cannot alter RETURNS TABLE).
-- Requires GRANT SELECT (cover_photo) ON public.campgrounds TO anon, authenticated
-- (from 20261125025950_park_media_storage.sql); SECURITY INVOKER reads the column directly.

BEGIN;

DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
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
  require_amenity_codes text[] DEFAULT NULL,
  filter_currency text DEFAULT NULL,
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
  min_price_per_night numeric,
  price_currency text,
  cover_photo text
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
              chr(92),
              chr(92) || chr(92)
            ),
            '%',
            chr(92) || '%'
          ),
          '_',
          chr(92) || '_'
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
      public.normalize_guest_amenity_ids(require_amenity_codes) AS amenity_ids,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm,
      n.has_site_filters,
      (v_sort IN ('price', 'price-desc')) AS price_sort,
      -- Scope only when max_price is set (price sort alone must not hide parks).
      -- Missing → CAD; unknown → '' (matches no listing currency).
      CASE
        WHEN n.max_price_norm IS NULL THEN NULL
        WHEN public.normalize_listing_currency(search_campgrounds.filter_currency)
          IS NOT NULL
          THEN public.normalize_listing_currency(search_campgrounds.filter_currency)
        WHEN search_campgrounds.filter_currency IS NULL
          OR btrim(coalesce(search_campgrounds.filter_currency, '')) = ''
          THEN 'CAD'
        ELSE ''
      END AS price_currency_norm,
      -- Preferred currency for price-sort grouping only (not a filter): selected or CAD.
      coalesce(
        public.normalize_listing_currency(search_campgrounds.filter_currency),
        'CAD'
      ) AS sort_currency_pref
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
  base AS (
    SELECT
      c.id,
      c.name,
      c.description,
      c.address,
      c.city,
      c.province,
      c.country,
      c.currency,
      c.website,
      c.phone,
      c.cover_photo,
      CASE
        WHEN c.location IS NULL THEN NULL
        ELSE public.st_y(c.location::public.geometry)
      END AS latitude,
      CASE
        WHEN c.location IS NULL THEN NULL
        ELSE public.st_x(c.location::public.geometry)
      END AS longitude,
      p.amps_filter,
      p.required_codes,
      p.driveway_filter,
      p.min_rig,
      p.stay_kind_norm,
      p.site_types_filter,
      p.max_price_norm,
      p.has_site_filters,
      p.price_sort,
      p.sort_currency_pref
    FROM public.campgrounds AS c
    CROSS JOIN params AS p
    WHERE c.active = true
      AND public.campground_text_matches(c.name, c.city, c.province, p.q_pat, p.q_raw)
      AND (
        p.province_aliases_norm IS NULL
        OR lower(btrim(c.province)) = ANY (p.province_aliases_norm)
      )
      AND (
        p.price_currency_norm IS NULL
        OR c.currency = p.price_currency_norm
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
        p.amenity_ids IS NOT NULL
        AND (
          cardinality(p.amenity_ids) = 0
          OR (
            SELECT count(*)::int
            FROM public.campground_amenities AS ca
            WHERE ca.campground_id = c.id
              AND ca.amenity_id = ANY (p.amenity_ids)
          ) = cardinality(p.amenity_ids)
        )
      )
  ),
  priced AS (
    SELECT
      b.*,
      CASE
        WHEN b.has_site_filters OR b.price_sort THEN
          public.campground_matching_site_min_price(
            b.id,
            b.amps_filter,
            b.required_codes,
            b.driveway_filter,
            b.min_rig,
            b.stay_kind_norm,
            b.site_types_filter,
            b.max_price_norm
          )
        ELSE NULL
      END AS min_price_early
    FROM base AS b
  ),
  filtered AS (
    SELECT *
    FROM priced AS pr
    WHERE NOT pr.has_site_filters
      OR pr.min_price_early IS NOT NULL
  ),
  limited AS (
    SELECT *
    FROM (
      SELECT
        f.*,
        row_number() OVER (
          ORDER BY
            -- Preferred currency first so LIMIT cannot starve other currencies (#51).
            CASE
              WHEN v_sort IN ('price', 'price-desc')
                THEN (f.currency IS DISTINCT FROM f.sort_currency_pref)::int
            END ASC,
            CASE WHEN v_sort = 'price' THEN f.min_price_early END ASC NULLS LAST,
            CASE WHEN v_sort = 'price-desc' THEN f.min_price_early END DESC NULLS LAST,
            CASE WHEN v_sort = 'city' THEN lower(coalesce(f.city, '')) END ASC NULLS LAST,
            CASE WHEN v_sort = 'province' THEN lower(coalesce(f.province, '')) END ASC NULLS LAST,
            CASE WHEN v_sort = 'name-desc' THEN lower(f.name) END DESC NULLS LAST,
            lower(f.name) ASC,
            f.id ASC
        ) AS sort_rank
      FROM filtered AS f
    ) AS ranked
    WHERE sort_rank <= v_limit
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
    coalesce(
      l.min_price_early,
      public.campground_matching_site_min_price(
        l.id,
        ARRAY[]::smallint[],
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        ARRAY[]::text[],
        NULL
      )
    ) AS min_price_per_night,
    l.currency AS price_currency,
    l.cover_photo
  FROM limited AS l
  ORDER BY l.sort_rank;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) IS
  'Guest list search (#24/#51/#57): filter_currency scopes only with max_price; price sort groups preferred currency first then amount within currency; unknown currency fail-closed; returns cover_photo.';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- search_campgrounds_near: + cover_photo
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
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
  require_amenity_codes text[] DEFAULT NULL,
  filter_currency text DEFAULT NULL,
  sort_key text DEFAULT 'distance',
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
  min_price_per_night numeric,
  price_currency text,
  cover_photo text
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
    WHEN lower(btrim(coalesce(sort_key, 'distance'))) IN (
      'distance', 'name', 'name-desc', 'city', 'province', 'price', 'price-desc'
    ) THEN lower(btrim(coalesce(sort_key, 'distance')))
    ELSE 'distance'
  END;
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
              chr(92),
              chr(92) || chr(92)
            ),
            '%',
            chr(92) || '%'
          ),
          '_',
          chr(92) || '_'
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
      public.normalize_guest_amenity_ids(
        search_campgrounds_near.require_amenity_codes
      ) AS amenity_ids,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm,
      n.has_site_filters,
      (v_sort IN ('price', 'price-desc')) AS price_sort,
      CASE
        WHEN n.max_price_norm IS NULL THEN NULL
        WHEN public.normalize_listing_currency(search_campgrounds_near.filter_currency)
          IS NOT NULL
          THEN public.normalize_listing_currency(search_campgrounds_near.filter_currency)
        WHEN search_campgrounds_near.filter_currency IS NULL
          OR btrim(coalesce(search_campgrounds_near.filter_currency, '')) = ''
          THEN 'CAD'
        ELSE ''
      END AS price_currency_norm,
      coalesce(
        public.normalize_listing_currency(search_campgrounds_near.filter_currency),
        'CAD'
      ) AS sort_currency_pref
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
      p.amenity_ids,
      p.driveway_filter,
      p.min_rig,
      p.stay_kind_norm,
      p.site_types_filter,
      p.max_price_norm,
      p.has_site_filters,
      p.price_sort,
      p.price_currency_norm,
      p.sort_currency_pref
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
  base AS (
    SELECT
      c.id,
      c.name,
      c.description,
      c.address,
      c.city,
      c.province,
      c.country,
      c.currency,
      c.website,
      c.phone,
      c.cover_photo,
      public.st_y(c.location::public.geometry) AS latitude,
      public.st_x(c.location::public.geometry) AS longitude,
      public.ST_Distance(c.location, o.geog) AS distance_m,
      o.amps_filter,
      o.required_codes,
      o.driveway_filter,
      o.min_rig,
      o.stay_kind_norm,
      o.site_types_filter,
      o.max_price_norm,
      o.has_site_filters,
      o.price_sort,
      o.sort_currency_pref
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
        o.price_currency_norm IS NULL
        OR c.currency = o.price_currency_norm
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
        o.amenity_ids IS NOT NULL
        AND (
          cardinality(o.amenity_ids) = 0
          OR (
            SELECT count(*)::int
            FROM public.campground_amenities AS ca
            WHERE ca.campground_id = c.id
              AND ca.amenity_id = ANY (o.amenity_ids)
          ) = cardinality(o.amenity_ids)
        )
      )
  ),
  priced AS (
    SELECT
      b.*,
      CASE
        WHEN b.has_site_filters OR b.price_sort THEN
          public.campground_matching_site_min_price(
            b.id,
            b.amps_filter,
            b.required_codes,
            b.driveway_filter,
            b.min_rig,
            b.stay_kind_norm,
            b.site_types_filter,
            b.max_price_norm
          )
        ELSE NULL
      END AS min_price_early
    FROM base AS b
  ),
  filtered AS (
    SELECT *
    FROM priced AS pr
    WHERE NOT pr.has_site_filters
      OR pr.min_price_early IS NOT NULL
  ),
  limited AS (
    SELECT *
    FROM (
      SELECT
        f.*,
        row_number() OVER (
          ORDER BY
            CASE
              WHEN v_sort IN ('price', 'price-desc')
                THEN (f.currency IS DISTINCT FROM f.sort_currency_pref)::int
            END ASC,
            CASE WHEN v_sort = 'price' THEN f.min_price_early END ASC NULLS LAST,
            CASE WHEN v_sort = 'price-desc' THEN f.min_price_early END DESC NULLS LAST,
            CASE WHEN v_sort = 'city' THEN lower(coalesce(f.city, '')) END ASC NULLS LAST,
            CASE WHEN v_sort = 'province' THEN lower(coalesce(f.province, '')) END ASC NULLS LAST,
            CASE WHEN v_sort = 'name' THEN lower(f.name) END ASC NULLS LAST,
            CASE WHEN v_sort = 'name-desc' THEN lower(f.name) END DESC NULLS LAST,
            CASE WHEN v_sort = 'distance' THEN f.distance_m END ASC NULLS LAST,
            CASE WHEN v_sort <> 'distance' THEN f.distance_m END ASC NULLS LAST,
            lower(f.name) ASC,
            f.id ASC
        ) AS sort_rank
      FROM filtered AS f
    ) AS ranked
    WHERE sort_rank <= v_limit
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
    coalesce(
      l.min_price_early,
      public.campground_matching_site_min_price(
        l.id,
        ARRAY[]::smallint[],
        ARRAY[]::text[],
        NULL,
        NULL,
        NULL,
        ARRAY[]::text[],
        NULL
      )
    ) AS min_price_per_night,
    l.currency AS price_currency,
    l.cover_photo
  FROM limited AS l
  ORDER BY l.sort_rank;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) IS
  'Guest near search (#24/#51/#57): filter_currency scopes only with max_price; price sort groups preferred currency first; unknown currency fail-closed; returns cover_photo.';

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, text, integer
) TO authenticated, anon, service_role;

COMMIT;
