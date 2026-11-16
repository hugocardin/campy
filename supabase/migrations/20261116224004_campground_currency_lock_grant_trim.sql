-- #52: public probe is only useful with a user JWT (is_platform_admin).
-- service_role has no auth.uid(), so the grant always 42501 — revoke it.

REVOKE ALL ON FUNCTION public.campground_currency_lock_reason(uuid)
  FROM service_role;

GRANT EXECUTE ON FUNCTION public.campground_currency_lock_reason(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.campground_currency_lock_reason(uuid) IS
  'Admin edit probe for listing-currency lock. SECURITY DEFINER + is_platform_admin() gate; EXECUTE for authenticated only (service_role: use private.campground_currency_lock_reason) (#52).';
