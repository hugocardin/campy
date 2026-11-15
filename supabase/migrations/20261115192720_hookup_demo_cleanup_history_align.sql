-- History alignment for hookup search filters (PR #25).
--
-- Versions 20261115191024 and 20261115191846 were already applied live before
-- later repo edits. Those version IDs stay as applied:
--   * 20261115191024 recorded a demo site_amenities INSERT (plus catalog codes
--     and the initial require_* RPC expansions).
--   * 20261115191846 recorded an unscoped DELETE of all ELECTRICITY/WATER/SEWER
--     site_amenities links, then per-site AND RPCs, protect trigger, and drop of
--     the province text near-me overload.
--
-- Demo site_amenities for local/dev belong only in supabase/seed.sql going
-- forward (requires parks/sites to already exist).
--
-- This migration re-asserts the intended scoped cleanup of those exact demo
-- tuples (idempotent: live already has 0 matching rows after the unscoped
-- DELETE). Fresh environments that replay 91024→91846 already cleared all
-- hookup site_amenities; the scoped DELETE remains a no-op there too.

DELETE FROM public.site_amenities AS sa
USING public.sites AS s,
      public.campgrounds AS c,
      public.amenities AS a
WHERE sa.site_id = s.id
  AND c.id = s.campground_id
  AND a.id = sa.amenity_id
  AND (c.name, s.name, a.code) IN (
    ('Alice Lake Provincial Park', 'AL-1', 'ELECTRICITY'),
    ('Alice Lake Provincial Park', 'AL-1', 'WATER'),
    ('Alice Lake Provincial Park', 'AL-1', 'SEWER'),
    ('Alice Lake Provincial Park', 'AL-12', 'ELECTRICITY'),
    ('Green Point Campground – Pacific Rim', 'GP-21', 'ELECTRICITY'),
    ('Green Point Campground – Pacific Rim', 'GP-21', 'WATER'),
    ('Emerald Lake Campground', 'E-2', 'WATER'),
    ('Gold Creek Campground – Golden Ears', 'A2', 'SEWER')
  );
