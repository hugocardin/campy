-- PR #31 follow-up:
-- 1) Trigger no longer calls site_max_rig_length_valid (EXECUTE revoked from
--    authenticated) — inline LODGING/RV rules with one site_types lookup.
-- 2) Restore SET search_path = '' on matching/normalize helpers (advisor;
--    EXISTS helpers are never inlined by Postgres anyway).

-- ---------------------------------------------------------------------------
-- Trigger: inline type attributes (no helper EXECUTE needed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sites_enforce_type_attributes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  site_code text;
BEGIN
  SELECT st.code INTO site_code
  FROM public.site_types AS st
  WHERE st.id = NEW.site_type_id;

  IF site_code IS NULL THEN
    RAISE EXCEPTION
      'unknown site_type_id %',
      NEW.site_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF site_code = 'LODGING' THEN
    IF NEW.max_rig_length IS NOT NULL THEN
      RAISE EXCEPTION
        'max_rig_length must be null for LODGING sites (site_type_id %)',
        NEW.site_type_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.driveway_type IS NOT NULL THEN
      RAISE EXCEPTION
        'driveway_type must be null for LODGING sites (site_type_id %)',
        NEW.site_type_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF site_code IN ('RV', 'RV_AND_TENT') THEN
    IF NEW.max_rig_length IS NULL OR NEW.max_rig_length <= 0 THEN
      RAISE EXCEPTION
        'max_rig_length must be > 0 for % sites (site_type_id %)',
        site_code,
        NEW.site_type_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- TENT (and any future types): max_rig_length optional; driveway allowed.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sites_enforce_type_attributes() IS
  'BEFORE INSERT/UPDATE: LODGING → null max_rig + driveway; RV/RV_AND_TENT → max_rig > 0. Inlined (no site_max_rig_length_valid) so authenticated writers work after EXECUTE revoke.';

-- Helper no longer needed by trigger; keep revoked / drop to avoid drift.
DROP FUNCTION IF EXISTS public.site_max_rig_length_valid(integer, numeric);

-- ---------------------------------------------------------------------------
-- Restore SET search_path on helpers (not inlinable; advisor hygiene)
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
  'Same-site guest filters for search RPCs (SECURITY INVOKER; SET search_path). Per-row call — EXISTS body is not Postgres-inlinable; lateral/inline into RPCs only if catalogs grow large. TENT with optional max_rig can match min_rig (intentional).';

CREATE OR REPLACE FUNCTION public.normalize_campground_site_filter_params(
  require_amps smallint[],
  require_water boolean,
  require_sewer boolean,
  require_driveway_type text,
  min_rig_length numeric,
  stay_kind text
)
RETURNS TABLE (
  amps_filter smallint[],
  required_codes text[],
  driveway_filter text,
  min_rig numeric,
  stay_kind_norm text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
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
    END;
$$;

COMMENT ON FUNCTION public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text
) IS
  'Normalize guest site-filter RPC args for search_campgrounds / _near. SET search_path = ''''.';
