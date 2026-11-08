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

-- Please paste into the PR if reviewing view changes:
SELECT pg_get_viewdef('public.v_campgrounds'::regclass, true);
SELECT pg_get_viewdef('public.v_campgrounds_admin'::regclass, true);

SELECT relname, reloptions
FROM pg_class
WHERE relname IN ('v_campgrounds', 'v_campgrounds_admin');
```

Save the result; the migration `RAISE NOTICE`s each dropped name during apply.

## 1. Policy / grant inventory

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'amenity_categories', 'amenities', 'campgrounds', 'sites',
    'campground_amenities', 'site_amenities', 'site_types'
  )
ORDER BY tablename, cmd, policyname;

SELECT has_function_privilege('anon', 'public.is_platform_admin()', 'execute') AS anon_exec_is_platform_admin;
-- expect false

SELECT has_function_privilege('authenticated', 'public.is_platform_admin()', 'execute') AS auth_exec_is_platform_admin;
-- expect true

SELECT has_table_privilege('anon', 'public.v_campgrounds_admin', 'select') AS anon_sel_admin_view;
SELECT has_table_privilege('authenticated', 'public.v_campgrounds_admin', 'select') AS auth_sel_admin_view;
-- expect false, false

SELECT has_function_privilege('anon', 'public.get_campgrounds_admin(uuid)', 'execute') AS anon_exec_admin_rpc;
SELECT has_function_privilege('authenticated', 'public.get_campgrounds_admin(uuid)', 'execute') AS auth_exec_admin_rpc;
-- expect false, true
```

## 2. `is_platform_admin()` with simulated JWT (SQL Editor)

Bare `SELECT public.is_platform_admin()` in the SQL Editor is always **false** (no JWT). Use:

```sql
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

## 3. Behavioral checks (PostgREST / app)

| Attempt | Expected |
| --- | --- |
| Anon `GET /rest/v1/campgrounds?select=*` | **Active only** (inactive 0); `owner_id` UUID may appear — accepted for now |
| Anon `GET /rest/v1/sites` for inactive park | **0 rows** |
| Anon `GET /rest/v1/v_campgrounds` | Same active count/sample as **before** apply (public listing unbroken) |
| Anon / non-admin `GET /rest/v1/v_campgrounds_admin` | Denied / empty |
| Non-admin `rpc/get_campgrounds_admin` | **`42501`** (permission denied), not empty list |
| Platform admin `rpc/get_campgrounds_admin` | Rows **with** `owner_email` / `owner_full_name`, ordered by `name` |
| Anon/auth catalog writes | `42501` or 0 rows mutated |
| Non-admin `UPDATE` own `profiles.role_id` | Fail `42501` — see `probes/profiles-user-roles-rls.md` (`20261031035111`) |
| App RLS-blocked `.single()` update | `DB_NOT_FOUND` (PGRST116 mapped), not unhandled |

Throwaway rows only: create via **service role**, attempt mutate as normal user, clean up with service role.
