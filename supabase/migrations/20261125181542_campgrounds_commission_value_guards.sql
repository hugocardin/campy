-- #61 / parked from #59 review: DB-level guards on campgrounds.commission_value.
-- Applied live as version 20261125181542.
-- Aligns with app/actions/campgrounds-admin.ts → lib/campground-commission.ts:
--   - no type → value 0
--   - percent → 0..100
--   - fixed → 0..999999.99 (numeric(8,2) already caps the upper bound)
-- Live probe (2026-11-25): 6 rows; 0 nulls, 0 negatives, 0 percent>100,
-- 0 null-type with non-zero value — safe to add strict CHECKs.

-- Defensive backfill before NOT NULL (column default is already 0).
UPDATE public.campgrounds
SET commission_value = 0
WHERE commission_value IS NULL;

ALTER TABLE public.campgrounds
  ALTER COLUMN commission_value SET DEFAULT 0,
  ALTER COLUMN commission_value SET NOT NULL;

ALTER TABLE public.campgrounds
  DROP CONSTRAINT IF EXISTS campgrounds_commission_value_nonneg_chk;

ALTER TABLE public.campgrounds
  ADD CONSTRAINT campgrounds_commission_value_nonneg_chk
  CHECK (commission_value >= 0);

COMMENT ON CONSTRAINT campgrounds_commission_value_nonneg_chk ON public.campgrounds IS
  'commission_value must be non-negative (matches normalizeCommissionInput).';

ALTER TABLE public.campgrounds
  DROP CONSTRAINT IF EXISTS campgrounds_commission_value_null_type_chk;

ALTER TABLE public.campgrounds
  ADD CONSTRAINT campgrounds_commission_value_null_type_chk
  CHECK (
    commission_type_id IS NOT NULL
    OR commission_value = 0
  );

COMMENT ON CONSTRAINT campgrounds_commission_value_null_type_chk ON public.campgrounds IS
  'When commission_type_id is null, commission_value must be 0 (matches normalizeCommissionInput).';

-- Percent upper bound needs commission_types.name — use a trigger (CHECK cannot
-- read other tables). Fixed type relies on numeric(8,2) for COMMISSION_FIXED_MAX.
CREATE OR REPLACE FUNCTION public.campgrounds_enforce_commission_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  type_name text;
BEGIN
  IF NEW.commission_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ct.name
  INTO type_name
  FROM public.commission_types AS ct
  WHERE ct.id = NEW.commission_type_id;

  IF type_name IS NULL THEN
    -- FK should prevent this; fail closed if the lookup row vanished mid-write.
    RAISE EXCEPTION
      'campgrounds_commission_type_missing: commission_type_id % not found',
      NEW.commission_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF lower(btrim(type_name)) = 'percent' AND NEW.commission_value > 100 THEN
    RAISE EXCEPTION
      'campgrounds_commission_percent_max: commission_value % exceeds 100 for percent type',
      NEW.commission_value
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.campgrounds_enforce_commission_value() IS
  'BEFORE INSERT/UPDATE: percent commission_value must be <= 100 (#61). Matches COMMISSION_PERCENT_MAX.';

REVOKE ALL ON FUNCTION public.campgrounds_enforce_commission_value() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campgrounds_enforce_commission_value()
  FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_campgrounds_enforce_commission_value
  ON public.campgrounds;

CREATE TRIGGER trg_campgrounds_enforce_commission_value
  BEFORE INSERT OR UPDATE OF commission_type_id, commission_value
  ON public.campgrounds
  FOR EACH ROW
  EXECUTE FUNCTION public.campgrounds_enforce_commission_value();
