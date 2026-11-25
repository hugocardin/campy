-- PR #63 follow-up: least-privilege grants on commission_types.
-- Writes are already blocked by RLS (SELECT-only for owner/admin/platform_admin),
-- but table grants still allow arwdDxtm. Align with booking_statuses harden:
-- REVOKE ALL from anon/authenticated; GRANT SELECT to authenticated only
-- (anon has no read policy on this table).

BEGIN;

REVOKE ALL ON public.commission_types FROM anon, authenticated;
GRANT SELECT ON public.commission_types TO authenticated;

COMMENT ON TABLE public.commission_types IS
  'Lookup: percent | fixed. Seeded by 20261125181703; SELECT for authenticated (RLS further limits to owner/admin/platform_admin); anon has no table SELECT.';

COMMIT;
