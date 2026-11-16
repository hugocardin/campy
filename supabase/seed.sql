-- Dev / local demo data only — do not apply as a schema migration.
--
-- Prerequisites (not seeded here):
--   * Amenity codes WATER / SEWER (from
--     20261115191024_search_campgrounds_hookup_filters)
--   * DUMP_STATION amenity + sites.driveway_type
--     (20261116021437_dump_driveway_rig_search)
--   * sites.electricity_amps (20261116014604 + harden 20261116015837)
--   * ELECTRICITY amenity retired (amps column only)
--   * The named campgrounds and sites below (Campy demo catalog). On a fresh
--     `supabase db reset` with no park/site seed, this INSERT matches nothing.
--
-- After parks/sites exist, run this (or paste into SQL Editor) so hookup /
-- dump / driveway / rig filters are exercisable locally.

UPDATE public.sites AS s
SET electricity_amps = v.amps,
    updated_at = now()
FROM (
  VALUES
    ('Alice Lake Provincial Park', 'AL-1', ARRAY[15, 50]::smallint[]),
    ('Alice Lake Provincial Park', 'AL-12', ARRAY[30]::smallint[]),
    ('Green Point Campground – Pacific Rim', 'GP-21', ARRAY[50]::smallint[])
) AS v(park, site, amps)
JOIN public.campgrounds AS c ON c.name = v.park
WHERE s.campground_id = c.id
  AND s.name = v.site;

UPDATE public.sites AS s
SET driveway_type = v.driveway,
    updated_at = now()
FROM (
  VALUES
    ('Alice Lake Provincial Park', 'AL-1', 'PULL_THROUGH'),
    ('Alice Lake Provincial Park', 'AL-12', 'BACK_IN'),
    ('Green Point Campground – Pacific Rim', 'GP-21', 'PULL_THROUGH'),
    ('Emerald Lake Campground', 'E-2', 'PULL_THROUGH'),
    ('Gold Creek Campground – Golden Ears', 'A3', 'BACK_IN')
) AS v(park, site, driveway)
JOIN public.campgrounds AS c ON c.name = v.park
WHERE s.campground_id = c.id
  AND s.name = v.site;

INSERT INTO public.site_amenities (site_id, amenity_id)
SELECT s.id, a.id
FROM public.sites AS s
JOIN public.campgrounds AS c ON c.id = s.campground_id
JOIN public.amenities AS a ON a.code IN ('WATER', 'SEWER')
WHERE (c.name, s.name, a.code) IN (
  ('Alice Lake Provincial Park', 'AL-1', 'WATER'),
  ('Alice Lake Provincial Park', 'AL-1', 'SEWER'),
  ('Green Point Campground – Pacific Rim', 'GP-21', 'WATER'),
  ('Emerald Lake Campground', 'E-2', 'WATER'),
  ('Gold Creek Campground – Golden Ears', 'A2', 'SEWER')
)
ON CONFLICT (site_id, amenity_id) DO NOTHING;

INSERT INTO public.campground_amenities (campground_id, amenity_id)
SELECT c.id, a.id
FROM public.campgrounds AS c
CROSS JOIN public.amenities AS a
WHERE a.code = 'DUMP_STATION'
  AND c.name IN (
    'Alice Lake Provincial Park',
    'Green Point Campground – Pacific Rim'
  )
ON CONFLICT (campground_id, amenity_id) DO NOTHING;
