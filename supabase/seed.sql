-- Dev / local demo data only — do not apply as a schema migration.
--
-- Prerequisites (not seeded here):
--   * Amenity codes ELECTRICITY / WATER / SEWER (from
--     20261115191024_search_campgrounds_hookup_filters)
--   * The named campgrounds and sites below (Campy demo catalog). On a fresh
--     `supabase db reset` with no park/site seed, this INSERT matches nothing.
--
-- After parks/sites exist, run this (or paste into SQL Editor) so hookup
-- filters are exercisable locally.

INSERT INTO public.site_amenities (site_id, amenity_id)
SELECT s.id, a.id
FROM public.sites AS s
JOIN public.campgrounds AS c ON c.id = s.campground_id
JOIN public.amenities AS a ON a.code IN ('ELECTRICITY', 'WATER', 'SEWER')
WHERE (c.name, s.name, a.code) IN (
  ('Alice Lake Provincial Park', 'AL-1', 'ELECTRICITY'),
  ('Alice Lake Provincial Park', 'AL-1', 'WATER'),
  ('Alice Lake Provincial Park', 'AL-1', 'SEWER'),
  ('Alice Lake Provincial Park', 'AL-12', 'ELECTRICITY'),
  ('Green Point Campground – Pacific Rim', 'GP-21', 'ELECTRICITY'),
  ('Green Point Campground – Pacific Rim', 'GP-21', 'WATER'),
  ('Emerald Lake Campground', 'E-2', 'WATER'),
  ('Gold Creek Campground – Golden Ears', 'A2', 'SEWER')
)
ON CONFLICT (site_id, amenity_id) DO NOTHING;
