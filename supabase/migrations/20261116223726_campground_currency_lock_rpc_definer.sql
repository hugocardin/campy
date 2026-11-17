-- #52: public admin probe must be SECURITY DEFINER so it can call
-- private.campground_currency_lock_reason (authenticated has no USAGE/EXECUTE
-- on private). Keep is_platform_admin() gate first; auth.uid() still sees JWT.

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
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin required'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.campground_currency_lock_reason(p_campground_id);
END;
$$;

COMMENT ON FUNCTION public.campground_currency_lock_reason(uuid) IS
  'Admin edit probe for listing-currency lock. SECURITY DEFINER + is_platform_admin() gate; core rule stays private (#52).';

REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.campground_currency_lock_reason(uuid)
  TO authenticated, service_role;
