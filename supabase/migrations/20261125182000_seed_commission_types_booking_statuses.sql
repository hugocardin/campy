-- Seed lookup rows for commission_types + booking_statuses (Phase C).
--
-- Live probe (service role, 2026-11-25):
--   * commission_types already had id 1=percent, 2=fixed (campgrounds FK those ids).
--   * booking_statuses was empty.
-- Idempotent: insert only when neither the stable id nor the name exists.
-- Names match app expectations (lib/campground-commission.ts) and Phase D/F
-- booking lifecycle (pending → confirmed; cancelled / refunded).

BEGIN;

INSERT INTO public.commission_types (id, name)
SELECT v.id, v.name
FROM (
  VALUES
    (1, 'percent'),
    (2, 'fixed')
) AS v(id, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.commission_types AS ct
  WHERE ct.id = v.id OR ct.name = v.name
);

INSERT INTO public.booking_statuses (id, name)
SELECT v.id, v.name
FROM (
  VALUES
    (1, 'pending'),
    (2, 'confirmed'),
    (3, 'cancelled'),
    (4, 'refunded')
) AS v(id, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.booking_statuses AS bs
  WHERE bs.id = v.id OR bs.name = v.name
);

-- Keep serials ahead of any explicitly seeded ids.
SELECT setval(
  pg_get_serial_sequence('public.commission_types', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.commission_types)
);

SELECT setval(
  pg_get_serial_sequence('public.booking_statuses', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM public.booking_statuses)
);

COMMENT ON TABLE public.commission_types IS
  'Lookup: percent | fixed. Seeded by 20261125182000; admin SELECT via RLS.';

COMMENT ON TABLE public.booking_statuses IS
  'Lookup: pending | confirmed | cancelled | refunded. Seeded by 20261125182000; RLS parked on #55.';

COMMIT;
