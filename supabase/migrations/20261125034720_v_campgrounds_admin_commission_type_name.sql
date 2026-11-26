-- Admin catalog: expose commission_types.name beside commission_type_id
-- so platform-admin reads don't need a second lookup round-trip.
-- Applied on Campy as version 20261125034720.

BEGIN;

CREATE OR REPLACE VIEW public.v_campgrounds_admin AS
SELECT
  c.id,
  c.owner_id,
  p.full_name AS owner_full_name,
  p.email AS owner_email,
  c.name,
  c.description,
  c.address,
  c.city,
  c.province,
  c.country,
  c.website,
  c.phone,
  c.active,
  c.commission_type_id,
  c.commission_value,
  st_y(c.location::geometry) AS latitude,
  st_x(c.location::geometry) AS longitude,
  c.currency,
  c.cover_photo,
  ct.name AS commission_type_name
FROM public.campgrounds AS c
LEFT JOIN public.profiles AS p ON c.owner_id = p.id
LEFT JOIN public.commission_types AS ct ON ct.id = c.commission_type_id;

COMMENT ON VIEW public.v_campgrounds_admin IS
  'Admin catalog of all campgrounds + owner identity + commission type name (direct SELECT revoked).';

REVOKE ALL ON TABLE public.v_campgrounds_admin FROM PUBLIC, anon, authenticated;

COMMIT;
