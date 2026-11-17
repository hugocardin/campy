-- #24 / parked from #51: hard-block campgrounds.currency once the park has
-- sites (price reinterpretation) or any booking that stores amounts
-- (bookings.total_price is NOT NULL today — any booking counts).
-- Defense in depth with updateCampgroundAction; admin UI disables the control.

CREATE OR REPLACE FUNCTION public.protect_campground_currency_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sites AS s
    WHERE s.campground_id = OLD.id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'campground_currency_locked:sites — cannot change listing currency once sites exist (no FX)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- total_price is NOT NULL on bookings today, so every booking stores an
  -- amount. Keep the join ready for Phase D; this branch is inert while the
  -- table is empty.
  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    INNER JOIN public.sites AS s ON s.id = b.site_id
    WHERE s.campground_id = OLD.id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'campground_currency_locked:bookings — cannot change listing currency once bookings store amounts (no FX)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_campground_currency_change() IS
  'BEFORE UPDATE on campgrounds: refuse currency change when sites exist or any booking stores amounts (#24/#51).';

DROP TRIGGER IF EXISTS trg_protect_campground_currency_change
  ON public.campgrounds;

CREATE TRIGGER trg_protect_campground_currency_change
  BEFORE UPDATE OF currency ON public.campgrounds
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_campground_currency_change();
