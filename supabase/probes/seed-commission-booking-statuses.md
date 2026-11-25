# Probe: seed `commission_types` / `booking_statuses`

Migrations:

- `20261125181703_seed_commission_types_booking_statuses.sql` (matches live version)
- `20261125182054_seed_lookups_review_fix.sql` (assert / setval / lookup RLS)

## Before apply (service role)

```sql
SELECT id, name FROM public.commission_types ORDER BY id;
-- Expect (already live): 1 percent, 2 fixed — or empty on a fresh DB.

SELECT id, name FROM public.booking_statuses ORDER BY id;
-- Expect: empty (0 rows) before the seed.

SELECT relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'booking_statuses';
-- Expect: false before review_fix.
```

Anon may see 0 `commission_types` rows: RLS allows SELECT only for
`owner` / `admin` / `platform_admin` (`current_user_role_code()`).

## After apply

```sql
SELECT id, name FROM public.commission_types ORDER BY id;
-- 1 percent, 2 fixed.

SELECT id, name FROM public.booking_statuses ORDER BY id;
-- 1 pending, 2 confirmed, 3 cancelled, 4 refunded.

SELECT last_value FROM public.commission_types_id_seq;
SELECT last_value FROM public.booking_statuses_id_seq;
-- Sequences ≥ MAX(id) (never rewound).

SELECT relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'booking_statuses';
-- true

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'booking_statuses';
-- booking_statuses_select_all, SELECT, {anon,authenticated}

SELECT has_table_privilege('anon', 'public.booking_statuses', 'INSERT') AS anon_ins,
       has_table_privilege('authenticated', 'public.booking_statuses', 'UPDATE') AS auth_upd;
-- both false

-- Re-apply review_fix must succeed (assert passes; RLS/policy idempotent).
```

App contract: `lib/booking-status.ts` `BOOKING_STATUS_NAMES` (resolve by name).

## Out of scope

- Full `bookings` RLS + grant harden → [#55](https://github.com/hugocardin/campy/issues/55) (Phase D)
- Commission value CHECKs → [#61](https://github.com/hugocardin/campy/issues/61)
