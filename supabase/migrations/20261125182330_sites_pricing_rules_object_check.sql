-- Harden sites.pricing_rules: NOT NULL object jsonb (Phase C admin editor).
-- Live probe: all rows already jsonb objects; no nulls.
-- Guest search still ignores this column until Phase D.

BEGIN;

UPDATE public.sites
  SET pricing_rules = '{}'::jsonb
  WHERE pricing_rules IS NULL
     OR jsonb_typeof(pricing_rules) IS DISTINCT FROM 'object';

ALTER TABLE public.sites
  ALTER COLUMN pricing_rules SET DEFAULT '{}'::jsonb;

ALTER TABLE public.sites
  ALTER COLUMN pricing_rules SET NOT NULL;

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_pricing_rules_object;

ALTER TABLE public.sites
  ADD CONSTRAINT sites_pricing_rules_object
  CHECK (jsonb_typeof(pricing_rules) = 'object');

COMMENT ON COLUMN public.sites.pricing_rules IS
  'Opaque jsonb object for future dynamic pricing (weekend/season/per-person). '
  'Default {}. Guest search uses price_per_night_base only until Phase D. '
  'Must be a JSON object (CHECK sites_pricing_rules_object).';

COMMIT;
