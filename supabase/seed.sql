-- Dev / local demo data only — do not apply as a schema migration.
--
-- Prerequisites (not seeded here):
--   * Amenity codes WATER / SEWER (from
--     20261115191024_search_campgrounds_hookup_filters)
--   * DUMP_STATION amenity + sites.driveway_type
--     (20261116022329_dump_driveway_rig_search + RPC follow-ups)
--   * sites.electricity_amps (20261116014604 + harden + 20261128184001 merge)
--     Allowed: 15 (15/20A tier), 30, 50
--     AL-12 uses {30,50} on purpose so local/demo can show a multi-outlet site
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
    -- 15/20A + 50A pedestal
    ('Alice Lake Provincial Park', 'AL-1', ARRAY[15, 50]::smallint[]),
    -- 30A + 50A pedestal (demo multi-outlet; not part of the 15/20 merge itself)
    ('Alice Lake Provincial Park', 'AL-12', ARRAY[30, 50]::smallint[]),
    -- 50A-only pedestal
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

-- Guest amenity filter demo (§24): park-level links (AND match).
INSERT INTO public.campground_amenities (campground_id, amenity_id)
SELECT c.id, a.id
FROM public.campgrounds AS c
CROSS JOIN public.amenities AS a
WHERE (c.name, a.code) IN (
  ('Alice Lake Provincial Park', 'WIFI'),
  ('Alice Lake Provincial Park', 'PET FRIENDLY'),
  ('Alice Lake Provincial Park', 'FIRE PIT'),
  ('Emerald Lake Campground', 'WIFI'),
  ('Emerald Lake Campground', 'FIRE PIT'),
  ('Green Point Campground – Pacific Rim', 'PET FRIENDLY'),
  ('Green Point Campground – Pacific Rim', 'FIRE PIT'),
  ('Gold Creek Campground – Golden Ears', 'WIFI'),
  ('Gold Creek Campground – Golden Ears', 'SOCCER')
)
ON CONFLICT (campground_id, amenity_id) DO NOTHING;
