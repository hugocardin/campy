# Probe: seed `commission_types` / `booking_statuses`

Migration: `20261125182000_seed_commission_types_booking_statuses.sql`

## Before apply (service role)

```sql
SELECT id, name FROM public.commission_types ORDER BY id;
-- Expect (already live): 1 percent, 2 fixed — or empty on a fresh DB.

SELECT id, name FROM public.booking_statuses ORDER BY id;
-- Expect: empty (0 rows) before this seed.

SELECT commission_type_id, COUNT(*) AS n
FROM public.campgrounds
GROUP BY 1
ORDER BY 1 NULLS FIRST;
-- Live had FKs to 1 and 2 before the in-repo seed existed.
```

Anon may see 0 `commission_types` rows: RLS allows SELECT only for
`owner` / `admin` / `platform_admin` (`current_user_role_code()`).

## After apply

```sql
SELECT id, name FROM public.commission_types ORDER BY id;
-- 1 percent, 2 fixed (unchanged if already present).

SELECT id, name FROM public.booking_statuses ORDER BY id;
-- 1 pending, 2 confirmed, 3 cancelled, 4 refunded.

SELECT last_value, is_called FROM public.commission_types_id_seq;
SELECT last_value, is_called FROM public.booking_statuses_id_seq;
-- Sequences ≥ MAX(id).

-- Re-apply must be a no-op (row counts unchanged):
-- re-run the migration SQL / apply_migration with the same script.
```

## Out of scope

- `booking_statuses` / `bookings` RLS + grant harden → [#55](https://github.com/hugocardin/campy/issues/55) (Phase D)
- Commission value CHECKs → [#61](https://github.com/hugocardin/campy/issues/61)
