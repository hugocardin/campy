-- Guest-safe near-me search via PostGIS ST_DWithin on campgrounds.location
-- (GiST campgrounds_location_idx). Returns the same columns as v_campgrounds
-- (no commission). SECURITY INVOKER so RLS on campgrounds applies.
-- Param names match PostgREST: lat, lng, radius_m, q, province (qualified
-- with the function name inside the body to avoid column ambiguity).

BEGIN;

CREATE OR REPLACE FUNCTION public.search_campgrounds_near(
  lat double precision,
  lng double precision,
  radius_m double precision,
  q text DEFAULT NULL,
  province text DEFAULT NULL
)
RETURNS SETOF public.v_campgrounds
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT v.*
  FROM public.v_campgrounds AS v
  INNER JOIN public.campgrounds AS c ON c.id = v.id
  WHERE c.location IS NOT NULL
    AND public.ST_DWithin(
      c.location,
      public.ST_SetSRID(
        public.ST_MakePoint(
          search_campgrounds_near.lng,
          search_campgrounds_near.lat
        ),
        4326
      )::public.geography,
      search_campgrounds_near.radius_m
    )
    AND (
      nullif(btrim(search_campgrounds_near.q), '') IS NULL
      OR v.name ILIKE '%' || btrim(search_campgrounds_near.q) || '%'
      OR v.city ILIKE '%' || btrim(search_campgrounds_near.q) || '%'
      OR v.province ILIKE '%' || btrim(search_campgrounds_near.q) || '%'
    )
    AND (
      nullif(btrim(search_campgrounds_near.province), '') IS NULL
      OR v.province = btrim(search_campgrounds_near.province)
    );
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision,
  double precision,
  double precision,
  text,
  text
) IS
  'Guest near-me search: active parks within radius_m of (lat,lng) via ST_DWithin; optional q/province filters; same columns as v_campgrounds; SECURITY INVOKER.';

COMMIT;
