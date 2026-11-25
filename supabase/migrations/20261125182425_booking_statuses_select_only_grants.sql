-- PR #63 follow-up: least-privilege grants on booking_statuses.
-- After 20261125182054, anon/authenticated still had REFERENCES/TRIGGER/MAINTAIN.
-- REVOKE ALL then GRANT SELECT only. Idempotent.

BEGIN;

REVOKE ALL ON public.booking_statuses FROM anon, authenticated;
GRANT SELECT ON public.booking_statuses TO anon, authenticated;

COMMENT ON TABLE public.booking_statuses IS
  'Lookup MVP: pending | confirmed | cancelled | refunded. Seeded by 20261125181703; SELECT-only for anon/authenticated (RLS + grants). Bookings table RLS remains #55.';

COMMIT;
