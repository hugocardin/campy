-- Harden guest campground access:
-- 1) Recreate v_campgrounds WITH (security_invoker=true) so writes use caller RLS.
-- 2) REVOKE ALL from PUBLIC/anon/authenticated; GRANT SELECT only (no write grants).
-- 3) Revoke authenticated table-level SELECT on campgrounds; grant guest columns only.
--    Platform-admin catalog continues via get_campgrounds_admin() SECURITY DEFINER RPC.

BEGIN;

DROP VIEW IF EXISTS public.v_campgrounds;

CREATE VIEW public.v_campgrounds
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  description,
  address,
  city,
  province,
  country,
  website,
  phone,
  st_y(location::geometry) AS latitude,
  st_x(location::geometry) AS longitude
FROM public.campgrounds
WHERE active = true;

COMMENT ON VIEW public.v_campgrounds IS
  'Guest-facing active campgrounds (no commission fields; security_invoker).';

REVOKE ALL ON TABLE public.v_campgrounds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_campgrounds TO anon, authenticated;

-- authenticated is every signed-in user, not platform-admin.
REVOKE SELECT ON TABLE public.campgrounds FROM authenticated;
GRANT SELECT (
  id,
  owner_id,
  name,
  description,
  address,
  city,
  province,
  country,
  location,
  website,
  phone,
  created_at,
  updated_at,
  active
) ON TABLE public.campgrounds TO authenticated;

COMMIT;
