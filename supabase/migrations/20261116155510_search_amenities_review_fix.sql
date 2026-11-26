-- PR #47 review: search_path, amenity_id AND match, fail-closed unknowns,
-- remove demo seed rows that were wrongly applied from the prior migration.

CREATE OR REPLACE FUNCTION public.amenity_code_canonical_key(code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT nullif(
    regexp_replace(upper(btrim(coalesce(code, ''))), '[^A-Z0-9]+', '_', 'g'),
    ''
  );
$$;

COMMENT ON FUNCTION public.amenity_code_canonical_key(text) IS
  'Canonical amenity key (#24): PET FRIENDLY → PET_FRIENDLY. search_path locked.';

-- Resolve guest amenity filter to amenity ids.
-- NULL  = fail closed (unknown / stale code in input)
-- {}    = no amenity filter
-- {ids} = park must have every id (AND)
-- Must stay in sync with lib/guest-amenity-codes.ts
-- (EXCLUDED = WATER/SEWER/DUMP_STATION/ELECTRICITY, max 16).
CREATE OR REPLACE FUNCTION public.normalize_guest_amenity_ids(
  require_amenity_codes text[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN require_amenity_codes IS NULL THEN ARRAY[]::uuid[]
    WHEN cardinality(require_amenity_codes) = 0 THEN ARRAY[]::uuid[]
    WHEN cardinality(require_amenity_codes) > 16 THEN ARRAY[]::uuid[]
    ELSE (
      WITH keys AS (
        SELECT DISTINCT public.amenity_code_canonical_key(c) AS k
        FROM unnest(require_amenity_codes) AS c
        WHERE public.amenity_code_canonical_key(c) IS NOT NULL
          AND char_length(public.amenity_code_canonical_key(c)) <= 64
          AND public.amenity_code_canonical_key(c) NOT IN (
            'WATER', 'SEWER', 'DUMP_STATION', 'ELECTRICITY'
          )
      ),
      resolved AS (
        SELECT
          k.k,
          (
            SELECT am.id
            FROM public.amenities AS am
            WHERE public.amenity_code_canonical_key(am.code) = k.k
            ORDER BY am.code
            LIMIT 1
          ) AS amenity_id
        FROM keys AS k
      )
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM keys) THEN ARRAY[]::uuid[]
        -- Any key missing from the catalog → fail closed (NULL).
        WHEN EXISTS (SELECT 1 FROM resolved WHERE amenity_id IS NULL) THEN NULL
        ELSE (
          SELECT array_agg(amenity_id ORDER BY k)
          FROM resolved
        )
      END
    )
  END;
$$;

COMMENT ON FUNCTION public.normalize_guest_amenity_ids(text[]) IS
  'Guest park amenity ids (#24 §3). NULL = unknown code (fail closed); {} = off; else AND.';

REVOKE ALL ON FUNCTION public.normalize_guest_amenity_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_guest_amenity_ids(text[])
  TO authenticated, anon, service_role;

-- Keep key helper for probes / TS alignment docs; prefer ids in RPCs.
CREATE OR REPLACE FUNCTION public.normalize_guest_amenity_codes(
  require_amenity_codes text[]
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- Prefer normalize_guest_amenity_ids for search RPCs.
  -- Keys-only view: empty when off/abuse; NULL not used (ids handle fail-closed).
  SELECT CASE
    WHEN require_amenity_codes IS NULL THEN ARRAY[]::text[]
    WHEN cardinality(require_amenity_codes) = 0 THEN ARRAY[]::text[]
    WHEN cardinality(require_amenity_codes) > 16 THEN ARRAY[]::text[]
    ELSE coalesce(
      (
        SELECT array_agg(DISTINCT k ORDER BY k)
        FROM (
          SELECT public.amenity_code_canonical_key(c) AS k
          FROM unnest(require_amenity_codes) AS c
        ) AS raw
        WHERE k IS NOT NULL
          AND char_length(k) <= 64
          AND k NOT IN ('WATER', 'SEWER', 'DUMP_STATION', 'ELECTRICITY')
          AND EXISTS (
            SELECT 1
            FROM public.amenities AS am
            WHERE public.amenity_code_canonical_key(am.code) = k
          )
      ),
      ARRAY[]::text[]
    )
  END;
$$;

DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, integer
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
      public.normalize_guest_amenity_ids(require_amenity_codes) AS amenity_ids,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm,
      n.has_site_filters,
      (v_sort IN ('price', 'price-desc')) AS price_sort
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
      p.amps_filter,
      p.required_codes,
      p.driveway_filter,
      p.min_rig,
      p.stay_kind_norm,
      p.site_types_filter,
      p.max_price_norm,
      p.has_site_filters,
      p.price_sort
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
      -- NULL amenity_ids = unknown code → match nothing (fail closed).
      -- {} = no amenity filter; non-empty = AND every amenity_id.
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
    ) AS min_price_per_night
  FROM limited AS l
  ORDER BY l.sort_rank;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, integer
) IS
  'Guest list search (#24): park amenity AND via amenity ids; unknown codes fail closed.';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], text, integer
) TO authenticated, anon, service_role;

DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], integer
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
      public.normalize_guest_amenity_ids(
        search_campgrounds_near.require_amenity_codes
      ) AS amenity_ids,
      n.driveway_filter,
      n.min_rig,
      n.stay_kind_norm,
      n.site_types_filter,
      n.max_price_norm,
      n.has_site_filters
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
      p.has_site_filters
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
      c.website,
      c.phone,
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
      o.has_site_filters
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
        WHEN b.has_site_filters THEN
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
          ORDER BY f.distance_m ASC, lower(f.name) ASC, f.id ASC
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
    ) AS min_price_per_night
  FROM limited AS l
  ORDER BY l.sort_rank;
END;
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], integer
) IS
  'Guest near search (#24): park amenity AND via amenity ids; unknown codes fail closed.';

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision,
  text, text[], smallint[], boolean, boolean, boolean, text, numeric, text, text[], numeric, text[], integer
) TO authenticated, anon, service_role;

-- Undo demo amenity links inserted by 20261116154552 (keep seed.sql for local).
DELETE FROM public.campground_amenities AS ca
USING public.campgrounds AS c, public.amenities AS a
WHERE ca.campground_id = c.id
  AND ca.amenity_id = a.id
  AND (c.name, a.code) IN (
    ('Alice Lake Provincial Park', 'WIFI'),
    ('Alice Lake Provincial Park', 'PET FRIENDLY'),
    ('Alice Lake Provincial Park', 'FIRE PIT'),
    ('Emerald Lake Campground', 'WIFI'),
    ('Emerald Lake Campground', 'FIRE PIT'),
    ('Green Point Campground – Pacific Rim', 'PET FRIENDLY'),
    ('Green Point Campground – Pacific Rim', 'FIRE PIT'),
    ('Gold Creek Campground – Golden Ears', 'WIFI'),
    ('Gold Creek Campground – Golden Ears', 'SOCCER')
  );
