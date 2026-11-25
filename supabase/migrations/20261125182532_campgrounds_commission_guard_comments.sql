-- #62 re-review: document fixed-max trigger reachability + silent rounding.
-- Applied live as version 20261125182532.
-- No behaviour change — COMMENT only. Prior guards: 20261125181542 / 20261125182132.

BEGIN;

COMMENT ON FUNCTION public.campgrounds_enforce_commission_value() IS
  'BEFORE INSERT/UPDATE: percent <= 100, fixed <= 999999.99 (#61/#62). '
  'SECURITY DEFINER; DETAIL markers for PostgREST. Matches COMMISSION_PERCENT_MAX / COMMISSION_FIXED_MAX. '
  'At commission_value numeric(8,2), values above 999999.99 fail as 22003 during type conversion '
  'before this fixed branch runs — the branch is for future column widening; map 22003 in '
  'mapCampgroundWriteError. Postgres silently rounds extra fraction digits (e.g. 12.345 → 12.35); '
  'the app rejects them in normalizeCommissionInput.';

COMMIT;
