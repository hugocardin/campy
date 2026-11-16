-- Follow-up to 20261116015837_sites_electricity_amps_harden:
-- 1) Document that shrinking electricity_amp_values() does not re-check existing rows
-- 2) Strip DEFAULTs from require_electricity compat wrappers so omitted-arg calls
--    uniquely resolve to require_amps (avoids PGRST203 / "function is not unique")
-- 3) Point COMPAT comments at tracking issue #30

COMMENT ON FUNCTION public.electricity_amps_valid(smallint[]) IS
  'True when amps is a duplicate-free subset of electricity_amp_values(). Must stay EXECUTEable by roles that INSERT/UPDATE sites (CHECK constraint). Removing a value from electricity_amp_values() requires a data migration plus ALTER TABLE sites VALIDATE CONSTRAINT (drop/re-add NOT VALID) — CHECK is not re-evaluated on function change. Adding a value is safe.';

-- Postgres cannot remove parameter defaults via CREATE OR REPLACE; drop first.
DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], boolean, boolean, boolean
);
DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
);

-- Main calls by name with all hookup args, so missing DEFAULTs are fine there.
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
    require_sewer
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps=electricity_amp_values(). No parameter DEFAULTs so omitted-arg calls resolve to require_amps. Drop after amps app deploys — tracked in https://github.com/hugocardin/campy/issues/30';

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
    require_sewer
  );
$$;

COMMENT ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) IS
  'COMPAT: maps require_electricity → require_amps=electricity_amp_values(). No parameter DEFAULTs so omitted-arg calls resolve to require_amps. Drop after amps app deploys — tracked in https://github.com/hugocardin/campy/issues/30';

REVOKE ALL ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds(
  text, text[], boolean, boolean, boolean
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
) TO anon, authenticated;
