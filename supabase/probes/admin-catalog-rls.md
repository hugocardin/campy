# Probe: admin catalog RLS

Run **after** applying `migrations/20261031030842_admin_catalog_rls.sql`.

Live Cloud Agent VMs need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (plus a non-admin test user) to automate PostgREST probes. Without them, use the SQL Editor (JWT simulation) + Auth + REST.

## 0. Snapshot before apply (once)

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'amenity_categories', 'amenities', 'campgrounds', 'sites',
    'campground_amenities', 'site_amenities', 'site_types'
  )
ORDER BY tablename, policyname;
```

Save the result; the migration `RAISE NOTICE`s each dropped name during apply.

## 1. Policy inventory

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'amenity_categories', 'amenities', 'campgrounds', 'sites',
    'campground_amenities', 'site_amenities', 'site_types'
  )
ORDER BY tablename, cmd, policyname;
```

Expect platform_admin write policies on all seven; campgrounds/sites SELECT policies named `*_select_active_*`, not `*_select_all`.

```sql
SELECT relname, reloptions
FROM pg_class
WHERE relname IN ('v_campgrounds', 'v_campgrounds_admin');
-- expect security_invoker=true

SELECT has_table_privilege('anon', 'public.v_campgrounds_admin', 'select') AS anon_can_select_admin_view;
-- expect false
```

Confirm the temporary drop helper is gone:

```sql
SELECT to_regprocedure('public._campy_drop_all_policies(text,text)') IS NULL AS drop_helper_gone;
-- expect true
```

## 2. `is_platform_admin()` with simulated JWT (SQL Editor)

The SQL Editor runs as `postgres` with no JWT — a bare `SELECT public.is_platform_admin()` is always **false**, not a useful test. Use:

```sql
-- Replace UUIDs with real profiles.id values from your project.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<platform-admin-uuid>', 'role', 'authenticated')::text,
  true
);
SELECT public.is_platform_admin(); -- expect true
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<normal-user-uuid>', 'role', 'authenticated')::text,
  true
);
SELECT public.is_platform_admin(); -- expect false
ROLLBACK;
```

## 3. Behavioral checks (PostgREST / app client)

| Attempt | Expected |
| --- | --- |
| Anon `SELECT` amenities / categories / site_types / junctions | Rows returned |
| Anon `SELECT` `campgrounds` where `active = false` | **0 rows** (not exposed) |
| Anon `SELECT` `sites` for an inactive park | **0 rows** |
| Anon `SELECT` `v_campgrounds` | Active parks only |
| Anon `SELECT` `v_campgrounds_admin` | Denied / empty (no anon grant) |
| Auth (non-admin) `INSERT`/`UPDATE`/`DELETE` catalog tables | `42501` or **0 rows** mutated |
| Auth (non-admin) `UPDATE` own `profiles.role_id` → platform_admin | **Fail** (policy / grant) — dependency for this whole gate |
| Auth (non-admin) `UPDATE`/`DELETE` `user_roles` | **0 rows** / denied |
| Platform admin session catalog writes | Succeed |
| App: non-admin (or RLS-blocked) `updateCampgroundAction` / `updateSiteAction` | Surfaces error (**not** fake success redirect) — actions now `.select().single()` |
| Amenity junction replace: RLS-blocked insert | Error after delete; empty amenity list remains valid product-wise |
| `POST /rest/v1/rpc/_campy_drop_all_policies` | **404** / not in schema |

Throwaway rows only: create via **service role**, attempt mutate as normal user, clean up with service role.
