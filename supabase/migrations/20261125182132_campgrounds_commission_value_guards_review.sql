-- #62 review follow-up for #61 (20261125181542 already applied live — do not amend).
-- Applied live as version 20261125182132.
-- Addresses: NaN finite CHECK, SECURITY DEFINER lookup, commission_types.name pin,
-- structured EXCEPTION DETAIL, explicit fixed max, transactional wrapper.

BEGIN;

-- ---------------------------------------------------------------------------
-- Reject NaN (numeric accepts it; `>= 0` is true for NaN on Postgres numeric).
-- Fold into the nonneg CHECK so one constraint covers both.
-- ---------------------------------------------------------------------------
ALTER TABLE public.campgrounds
  DROP CONSTRAINT IF EXISTS campgrounds_commission_value_nonneg_chk;

ALTER TABLE public.campgrounds
  ADD CONSTRAINT campgrounds_commission_value_nonneg_chk
  CHECK (
    commission_value >= 0
    AND commission_value <> 'NaN'::numeric
  );

COMMENT ON CONSTRAINT campgrounds_commission_value_nonneg_chk ON public.campgrounds IS
  'commission_value must be finite and non-negative (rejects NaN; matches normalizeCommissionInput).';

-- ---------------------------------------------------------------------------
-- Pin commission_types.name to the closed union shared with COMMISSION_TYPE_NAMES.
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_types
  DROP CONSTRAINT IF EXISTS commission_types_name_chk;

ALTER TABLE public.commission_types
  ADD CONSTRAINT commission_types_name_chk
  CHECK (name IN ('percent', 'fixed'));

COMMENT ON CONSTRAINT commission_types_name_chk ON public.commission_types IS
  'Closed union: percent | fixed (matches COMMISSION_TYPE_NAMES / normalizeCommissionInput).';

-- Refuse renames while campgrounds reference the row (would silently change
-- whether the percent cap applies to existing values).
CREATE OR REPLACE FUNCTION public.commission_types_refuse_name_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.campgrounds AS c
    WHERE c.commission_type_id = OLD.id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'commission_types_name_locked: cannot rename commission_types.id % while campgrounds reference it',
      OLD.id
      USING ERRCODE = 'check_violation',
            DETAIL = 'commission_types_name_locked';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.commission_types_refuse_name_rename() IS
  'BEFORE UPDATE OF name: refuse rename when campgrounds reference the row (#62).';

REVOKE ALL ON FUNCTION public.commission_types_refuse_name_rename() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commission_types_refuse_name_rename()
  FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_commission_types_refuse_name_rename
  ON public.commission_types;

CREATE TRIGGER trg_commission_types_refuse_name_rename
  BEFORE UPDATE OF name ON public.commission_types
  FOR EACH ROW
  EXECUTE FUNCTION public.commission_types_refuse_name_rename();

-- ---------------------------------------------------------------------------
-- Percent/fixed caps: SECURITY DEFINER (RLS on commission_types must not hide
-- the lookup), structured DETAIL, explicit fixed max (= COMMISSION_FIXED_MAX).
-- Names are canonical after commission_types_name_chk — no lower/btrim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campgrounds_enforce_commission_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
    RAISE EXCEPTION
      'campgrounds_commission_type_missing: commission_type_id % not found',
      NEW.commission_type_id
      USING ERRCODE = 'foreign_key_violation',
            DETAIL = 'commission_type_missing';
  END IF;

  IF type_name = 'percent' AND NEW.commission_value > 100 THEN
    RAISE EXCEPTION
      'campgrounds_commission_percent_max: commission_value % exceeds 100 for percent type',
      NEW.commission_value
      USING ERRCODE = 'check_violation',
            DETAIL = 'commission_percent_max';
  END IF;

  -- Explicit fixed cap (matches COMMISSION_FIXED_MAX). Do not rely only on
  -- numeric(8,2); widening the column must keep this branch in sync.
  IF type_name = 'fixed' AND NEW.commission_value > 999999.99 THEN
    RAISE EXCEPTION
      'campgrounds_commission_fixed_max: commission_value % exceeds 999999.99 for fixed type',
      NEW.commission_value
      USING ERRCODE = 'check_violation',
            DETAIL = 'commission_fixed_max';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.campgrounds_enforce_commission_value() IS
  'BEFORE INSERT/UPDATE: percent <= 100, fixed <= 999999.99 (#61/#62). SECURITY DEFINER; DETAIL markers for PostgREST. Matches COMMISSION_PERCENT_MAX / COMMISSION_FIXED_MAX.';

REVOKE ALL ON FUNCTION public.campgrounds_enforce_commission_value() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campgrounds_enforce_commission_value()
  FROM anon, authenticated;

-- Recreate trigger so it binds to the replaced function body.
DROP TRIGGER IF EXISTS trg_campgrounds_enforce_commission_value
  ON public.campgrounds;

CREATE TRIGGER trg_campgrounds_enforce_commission_value
  BEFORE INSERT OR UPDATE OF commission_type_id, commission_value
  ON public.campgrounds
  FOR EACH ROW
  EXECUTE FUNCTION public.campgrounds_enforce_commission_value();

COMMIT;
