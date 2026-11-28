-- Merge 15A and 20A into one low-tier outlet for Campy.
-- Canonical storage value remains 15; UI/i18n label is "15/20 A".
-- Keep in sync with lib/electricity-amps.ts ELECTRICITY_AMP_VALUES.

-- 1) Remap any stored 20 → 15 while 20 is still allowed by the CHECK.
UPDATE public.sites AS s
SET electricity_amps = sub.amps,
    updated_at = now()
FROM (
  SELECT
    s2.id,
    coalesce(
      (
        SELECT array_agg(v ORDER BY v)
        FROM (
          SELECT DISTINCT
            CASE
              WHEN x = 20 THEN 15::smallint
              ELSE x
            END AS v
          FROM unnest(s2.electricity_amps) AS x
        ) AS remapped
      ),
      '{}'::smallint[]
    ) AS amps
  FROM public.sites AS s2
  WHERE 20 = ANY (s2.electricity_amps)
) AS sub
WHERE s.id = sub.id;

-- 2) Drop 20 from the canonical allowed set (CHECK uses this via electricity_amps_valid).
CREATE OR REPLACE FUNCTION public.electricity_amp_values()
RETURNS smallint[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT ARRAY[15, 30, 50]::smallint[];
$$;

COMMENT ON FUNCTION public.electricity_amp_values() IS
  'Canonical allowed site electricity amps: 15 (15/20A tier), 30, 50. Keep in sync with lib/electricity-amps.ts ELECTRICITY_AMP_VALUES.';

COMMENT ON COLUMN public.sites.electricity_amps IS
  'Available pedestal outlet amps for this site; empty = no electricity. Allowed: 15 (combined 15/20A), 30, 50; no duplicates.';

COMMENT ON FUNCTION public.electricity_amps_valid(smallint[]) IS
  'True when amps is a duplicate-free subset of electricity_amp_values() (15/30/50). Must stay EXECUTEable by roles that INSERT/UPDATE sites (CHECK constraint).';
