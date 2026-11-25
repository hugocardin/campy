-- Seed lookup rows for commission_types + booking_statuses (Phase C).
--
-- Live probe (service role, 2026-11-25):
--   * commission_types already had id 1=percent, 2=fixed (campgrounds FK those ids).
--   * booking_statuses was empty.
-- Idempotent: insert only when neither the stable id nor the name exists,
-- then assert exact (id, name) pairs (fail closed on drift).
--
-- MVP status set (Phase D/F): pending → confirmed; cancelled / refunded.
-- Deliberately four names for now — payment_failed / expired / completed /
-- no_show / partial_refund can be added later without renames. App contract:
-- lib/booking-status.ts BOOKING_STATUS_NAMES (resolve by name, not bare ids).

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

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.commission_types AS ct
    JOIN (
      VALUES
        (1, 'percent'),
        (2, 'fixed')
    ) AS v(id, name) ON ct.id = v.id AND ct.name = v.name
  ) <> 2 THEN
    RAISE EXCEPTION 'commission_types seed mismatch: expected (1,percent),(2,fixed)';
  END IF;

  IF (
    SELECT count(*)
    FROM public.booking_statuses AS bs
    JOIN (
      VALUES
        (1, 'pending'),
        (2, 'confirmed'),
        (3, 'cancelled'),
        (4, 'refunded')
    ) AS v(id, name) ON bs.id = v.id AND bs.name = v.name
  ) <> 4 THEN
    RAISE EXCEPTION 'booking_statuses seed mismatch: expected (1,pending),(2,confirmed),(3,cancelled),(4,refunded)';
  END IF;
END $$;

-- Explicit sequence names; never rewind past last_value.
SELECT setval(
  'public.commission_types_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(id), 1) FROM public.commission_types),
    (SELECT last_value FROM public.commission_types_id_seq)
  )
);

SELECT setval(
  'public.booking_statuses_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(id), 1) FROM public.booking_statuses),
    (SELECT last_value FROM public.booking_statuses_id_seq)
  )
);

-- Lookup harden (not full bookings RLS — that stays on #55).
ALTER TABLE public.booking_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_statuses_select_all ON public.booking_statuses;
CREATE POLICY booking_statuses_select_all ON public.booking_statuses
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.booking_statuses FROM anon, authenticated;

COMMENT ON TABLE public.commission_types IS
  'Lookup: percent | fixed. Seeded by 20261125181703; admin SELECT via RLS.';

COMMENT ON TABLE public.booking_statuses IS
  'Lookup MVP: pending | confirmed | cancelled | refunded. Seeded by 20261125181703; SELECT open, writes revoked from anon/authenticated. Bookings table RLS remains #55.';

COMMIT;
