# Probe: profiles / user_roles RLS + signup trigger

Run **after** applying `migrations/20261031035111_profiles_user_roles_rls.sql`.

Requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (plus throwaway Auth users) for PostgREST probes. SQL Editor snippets cover inventory without Auth.

## 0. Snapshot before apply (once)

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_roles')
ORDER BY tablename, policyname;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal;

SELECT
  has_table_privilege('anon', 'public.profiles', 'select') AS anon_sel_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'select') AS auth_sel_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'update') AS auth_upd_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'insert') AS auth_ins_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'delete') AS auth_del_profiles,
  has_table_privilege('anon', 'public.user_roles', 'select') AS anon_sel_roles,
  has_table_privilege('authenticated', 'public.user_roles', 'update') AS auth_upd_roles;
```

Expect the live policy **“Restrict role changes to platform_admin”** to appear in the pre-apply snapshot; the migration drops it and replaces the role lock with trigger `trg_restrict_profile_role_id_change`.

## 1. Policy / trigger / grant inventory (after apply)

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_roles')
ORDER BY tablename, cmd, policyname;
-- expect: profiles_select_own, profiles_update_own_or_platform_admin,
--         user_roles_select_all — and NO "Restrict role changes to platform_admin"

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND tgname = 'trg_restrict_profile_role_id_change';

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND tgname = 'on_auth_user_created';

SELECT
  has_table_privilege('anon', 'public.profiles', 'select') AS anon_sel_profiles,           -- false
  has_table_privilege('authenticated', 'public.profiles', 'insert') AS auth_ins_profiles, -- false
  has_table_privilege('authenticated', 'public.profiles', 'delete') AS auth_del_profiles, -- false
  has_table_privilege('authenticated', 'public.user_roles', 'update') AS auth_upd_roles,  -- false
  has_table_privilege('authenticated', 'public.user_roles', 'delete') AS auth_del_roles;  -- false
```

## 2. Behavioral checks (PostgREST / Auth)

Use throwaway users via Auth Admin API; clean up with service role afterward.

| # | Attempt | Expected |
| --- | --- | --- |
| 1 | Non-admin `PATCH /profiles?id=eq.<me>` `{role_id: <platform_admin id>}` | **Fail** `42501` (trigger); role stays `user` |
| 2 | Non-admin `PATCH` own `{full_name: "..."}` | **200**; `role_id` unchanged |
| 3 | Non-admin `DELETE` own profile | **0 rows**; profile still present |
| 4 | Non-admin `POST` profile with `role_id = platform_admin` | **42501** RLS |
| 5 | Non-admin / anon `PATCH`/`POST`/`DELETE` on `user_roles` | Writes fail or **0 rows**; codes unchanged |
| 6 | Anon `GET /profiles` | **[]** (no privilege / no visible rows) |
| 7 | Auth `GET /user_roles` | All 4 lookup rows |
| 8 | Auth `GET /profiles` | **Own row only** (even platform_admin) |
| 9 | Platform_admin `PATCH` another user's `role_id` | **200**; role changes (trigger allows admin) |
| 10 | Public `signUp` with `user_metadata` roles (`role` / `role_id` / `app_role` = platform_admin) | New `profiles.role_id` = **1 (`user`)** |
| 11 | `rpc/current_user_role_code` as signed-in user | `"user"` / `"platform_admin"` matching profile (live helper; not redefined here) |

## 3. Notes

- Role lock is the **trigger**, not a WITH CHECK-only policy (Hugo PR #6).
- Column-level `REVOKE UPDATE (role_id)` was **not** used: live platform_admin role assignment via PostgREST must keep working.
- `handle_new_user` must not read role from `raw_user_meta_data`.
- Owner picker (`get-owners.ts`) uses **service_role** (bypasses RLS); do not widen `profiles` SELECT to all authenticated users.
