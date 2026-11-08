-- Guest campground reads must not expose commission terms.
-- DROP+CREATE required: CREATE OR REPLACE cannot remove view columns.
-- Applied on Campy as version 20261108172255.
-- Follow-up 20261108173136 adds security_invoker + authenticated guest-column grants.

BEGIN;

DROP VIEW IF EXISTS public.v_campgrounds;

CREATE VIEW public.v_campgrounds AS
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
  'Guest-facing active campgrounds (no commission fields).';

REVOKE ALL ON TABLE public.v_campgrounds FROM PUBLIC;
GRANT SELECT ON TABLE public.v_campgrounds TO anon, authenticated;

-- Base table: anon must not SELECT commission_* even via PostgREST column picks.
REVOKE SELECT ON TABLE public.campgrounds FROM anon;
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
) ON TABLE public.campgrounds TO anon;

COMMIT;
