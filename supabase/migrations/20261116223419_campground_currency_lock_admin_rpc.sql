-- #52 round 2: private DEFINER lock reason (trigger-only); public RPC gated
-- on is_platform_admin; serialize site campground_id moves too.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- ---------------------------------------------------------------------------
-- Core rule — not exposed via PostgREST (private schema).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.campground_currency_lock_reason(
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

COMMENT ON FUNCTION private.campground_currency_lock_reason(uuid) IS
  'Internal currency-lock reason (bookings first, else sites). Trigger-only; not granted to API roles (#52).';

REVOKE ALL ON FUNCTION private.campground_currency_lock_reason(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.campground_currency_lock_reason(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.campground_currency_lock_reason(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC for admin edit UI — platform_admin only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campground_currency_lock_reason(
  p_campground_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin required'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.campground_currency_lock_reason(p_campground_id);
END;
$$;

COMMENT ON FUNCTION public.campground_currency_lock_reason(uuid) IS
  'Admin edit probe for listing-currency lock. Requires is_platform_admin(); core rule is private (#52).';

REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.campground_currency_lock_reason(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger uses private helper (no admin check; works for any writer).
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

  PERFORM 1
  FROM public.campgrounds AS c
  WHERE c.id = OLD.id
  FOR UPDATE;

  lock_reason := private.campground_currency_lock_reason(OLD.id);
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

-- ---------------------------------------------------------------------------
-- Site insert OR campground_id move: FOR UPDATE target park.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sites_lock_campground_for_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- INSERT always; UPDATE only when campground_id changes.
  IF TG_OP = 'UPDATE'
     AND NEW.campground_id IS NOT DISTINCT FROM OLD.campground_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.campgrounds AS c
  WHERE c.id = NEW.campground_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campground % not found for site write', NEW.campground_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sites_lock_campground_for_currency() IS
  'BEFORE INSERT OR UPDATE OF campground_id on sites: FOR UPDATE parent park vs currency lock (#52).';

DROP TRIGGER IF EXISTS trg_sites_lock_campground_for_currency ON public.sites;

CREATE TRIGGER trg_sites_lock_campground_for_currency
  BEFORE INSERT OR UPDATE OF campground_id ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.sites_lock_campground_for_currency();
