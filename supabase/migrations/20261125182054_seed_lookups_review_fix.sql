-- Review follow-up for 20261125181703 (PR #63): assert seed pairs, never-rewind
-- setval, and booking_statuses lookup RLS. Safe when the original seed already
-- ran live without these guards (live version 20261125181703).
-- SELECT-only grant harden (REVOKE ALL + GRANT SELECT) is 20261125182425.

BEGIN;

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
