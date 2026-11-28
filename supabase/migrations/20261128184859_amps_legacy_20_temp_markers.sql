-- Mark the require_amps 20→15 remap as temporary compat (issue #73).
-- Same shim as ELECTRICITY_AMP_LEGACY_20 in lib/electricity-amps.ts — remove together.

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
  max_price_norm numeric,
  has_site_filters boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    n.amps_filter,
    n.required_codes,
    n.driveway_filter,
    n.min_rig,
    n.stay_kind_norm,
    n.site_types_filter,
    n.max_price_norm,
    (
      cardinality(n.amps_filter) > 0
      OR cardinality(n.required_codes) > 0
      OR n.driveway_filter IS NOT NULL
      OR n.min_rig IS NOT NULL
      OR n.stay_kind_norm IS NOT NULL
      OR cardinality(n.site_types_filter) > 0
      OR n.max_price_norm IS NOT NULL
    ) AS has_site_filters
  FROM (
    SELECT
      CASE
        WHEN require_amps IS NULL THEN ARRAY[]::smallint[]
        ELSE coalesce(
          (
            SELECT array_agg(DISTINCT remapped ORDER BY remapped)
            FROM (
              SELECT
                CASE
                  -- TEMP legacy 20A compat (15/20A merge); remove together with
                  -- ELECTRICITY_AMP_LEGACY_20 in lib/electricity-amps.ts (issue #73).
                  WHEN v = 20 THEN 15::smallint
                  ELSE v
                END AS remapped
              FROM unnest(require_amps) AS v
            ) AS raw
            WHERE remapped = 0
               OR remapped = ANY (public.electricity_amp_values())
          ),
          ARRAY[]::smallint[]
        )
      END AS amps_filter,
      array_remove(
        ARRAY[
          CASE WHEN coalesce(require_water, false) THEN 'WATER' END,
          CASE WHEN coalesce(require_sewer, false) THEN 'SEWER' END
        ],
        NULL
      ) AS required_codes,
      CASE
        WHEN require_driveway_type IS NULL THEN NULL
        WHEN upper(btrim(require_driveway_type)) IN ('PULL_THROUGH', 'BACK_IN')
          THEN upper(btrim(require_driveway_type))
        ELSE NULL
      END AS driveway_filter,
      CASE
        WHEN min_rig_length IS NULL THEN NULL
        WHEN min_rig_length > 0 THEN min_rig_length
        ELSE NULL
      END AS min_rig,
      CASE
        WHEN stay_kind IS NULL THEN NULL
        WHEN lower(btrim(stay_kind)) IN ('camping', 'lodging')
          THEN lower(btrim(stay_kind))
        ELSE NULL
      END AS stay_kind_norm,
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
      END AS site_types_filter,
      CASE
        WHEN max_price IS NULL THEN NULL
        WHEN max_price > 0 AND max_price <= 100000 THEN max_price
        ELSE NULL
      END AS max_price_norm
  ) AS n;
$$;

COMMENT ON FUNCTION public.normalize_campground_site_filter_params(
  smallint[], boolean, boolean, text, numeric, text, text[], numeric
) IS
  'Normalize guest site filters (#24/#27/#40). Temporary: remaps legacy require_amps 20→15 (15/20A tier; remove with ELECTRICITY_AMP_LEGACY_20 / #73). Returns has_site_filters so RPCs share one gate.';
