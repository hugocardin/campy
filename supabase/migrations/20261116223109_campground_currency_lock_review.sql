-- #52 review: shared lock-reason RPC (SECURITY DEFINER), bookings-first,
-- bookings.site_id ON DELETE RESTRICT (so site deletes cannot unlock currency),
-- structured EXCEPTION DETAIL, serialize site insert vs currency update.

-- ---------------------------------------------------------------------------
-- bookings.site_id: keep history; deleting sites must not cascade bookings
-- (and must not unlock listing currency by wiping amount rows).
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_site_id_fkey;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES public.sites(id)
  ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Single source of truth for lock reason (bookings first, then sites).
-- Returns 'bookings' | 'sites' | NULL. SECURITY DEFINER so RLS cannot hide
-- amount-bookings from the guard once bookings policies land.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campground_currency_lock_reason(
  p_campground_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_campground_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Bookings first: more specific; total_price is NOT NULL today.
  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    INNER JOIN public.sites AS s ON s.id = b.site_id
    WHERE s.campground_id = p_campground_id
  ) THEN
    RETURN 'bookings';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sites AS s
    WHERE s.campground_id = p_campground_id
  ) THEN
    RETURN 'sites';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.campground_currency_lock_reason(uuid) IS
  'Listing-currency lock reason: bookings (amount rows) first, else sites, else NULL. SECURITY DEFINER (#24/#52).';

REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.campground_currency_lock_reason(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger: DEFINER, uses shared reason, DETAIL = reason for PostgREST mapping.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_campground_currency_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lock_reason text;
BEGIN
  IF NEW.currency IS NOT DISTINCT FROM OLD.currency THEN
    RETURN NEW;
  END IF;

  -- Serialize against concurrent site inserts (FOR UPDATE on this row).
  PERFORM 1
  FROM public.campgrounds AS c
  WHERE c.id = OLD.id
  FOR UPDATE;

  lock_reason := public.campground_currency_lock_reason(OLD.id);
  IF lock_reason IS NOT NULL THEN
    RAISE EXCEPTION
      'campground_currency_locked:% — cannot change listing currency (no FX)',
      lock_reason
      USING ERRCODE = 'check_violation',
            DETAIL = lock_reason;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_campground_currency_change() IS
  'BEFORE UPDATE OF currency: refuse when campground_currency_lock_reason is set. SECURITY DEFINER; DETAIL carries sites|bookings (#24/#52).';

DROP TRIGGER IF EXISTS trg_protect_campground_currency_change
  ON public.campgrounds;

CREATE TRIGGER trg_protect_campground_currency_change
  BEFORE UPDATE OF currency ON public.campgrounds
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_campground_currency_change();

-- ---------------------------------------------------------------------------
-- Site insert: take campground FOR UPDATE so it cannot race a currency change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sites_lock_campground_for_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.campgrounds AS c
  WHERE c.id = NEW.campground_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campground % not found for site insert', NEW.campground_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sites_lock_campground_for_currency() IS
  'BEFORE INSERT on sites: FOR UPDATE the parent campground to serialize vs currency lock (#52).';

DROP TRIGGER IF EXISTS trg_sites_lock_campground_for_currency ON public.sites;

CREATE TRIGGER trg_sites_lock_campground_for_currency
  BEFORE INSERT ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.sites_lock_campground_for_currency();
