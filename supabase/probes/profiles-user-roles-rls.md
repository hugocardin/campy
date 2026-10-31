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

-- Live profiles columns (grants / updated_at / email nullability depend on this).
-- Paste this output into the PR (or apply NOTICE lines) so the final grant set
-- can be confirmed: allow-list ∩ live only; unexpected cols abort apply.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Expected authenticated UPDATE allow-list (migration intersects with live):
--   full_name, default_rig_length, preferred_site_type_id,
--   notification_preferences, bookmarked_campgrounds
-- Known server-owned (never granted): id, role_id, email, created_at, updated_at

-- email uniqueness ('' placeholder would collide if unique + NOT NULL)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'profiles'
  AND indexdef ILIKE '%email%';

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal;

-- Live auth.users companions (save output in PR before apply).
-- Migration inventories these BEFORE recreating sync; RAISE if
-- on_auth_user_updated points at anything other than public.sync_email_on_update.
SELECT
  t.tgname,
  n.nspname AS fn_schema,
  p.proname AS fn_name,
  (t.tgtype & (1 << 2)) <> 0 AS fires_insert,
  (t.tgtype & (1 << 4)) <> 0 AS fires_update,
  pg_get_triggerdef(t.oid) AS triggerdef
FROM pg_trigger AS t
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE t.tgrelid = 'auth.users'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Save live sync body (migration intentionally REPLACE with email-only).
-- Confirm prior body only touched profiles.email (or accept intentional replace).
-- '(not present)' is OK on a fresh project (use to_regproc — bare ::regproc errors).
SELECT CASE
  WHEN to_regproc('public.sync_email_on_update') IS NULL THEN '(not present)'
  ELSE pg_get_functiondef(to_regproc('public.sync_email_on_update'))
END AS sync_email_on_update_def;

SELECT
  has_table_privilege('anon', 'public.profiles', 'select') AS anon_sel_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'select') AS auth_sel_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'update') AS auth_upd_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'insert') AS auth_ins_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'delete') AS auth_del_profiles,
  has_table_privilege('anon', 'public.user_roles', 'select') AS anon_sel_roles,
  has_table_privilege('authenticated', 'public.user_roles', 'update') AS auth_upd_roles;

-- Invoker views / procs that touch profiles (anon regression risk after REVOKE):
SELECT c.relname, c.relkind, c.reloptions
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('v_campgrounds', 'v_campgrounds_admin', 'current_user_role_code');

SELECT p.proname, p.prosecdef,
       pg_get_functiondef(p.oid) LIKE '%profiles%' AS mentions_profiles
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_user_role_code', 'is_platform_admin', 'get_campgrounds_admin');
```

Expect the live policy **“Restrict role changes to platform_admin”** in the pre-apply snapshot; the migration drops it (trigger + `set_user_role` replace that lock).

Expected profiles columns (document; live may differ):
`id`, `role_id`, `full_name`, `email`, `default_rig_length`, `preferred_site_type_id`, `notification_preferences`, `bookmarked_campgrounds`, `created_at`, `updated_at`.

Column UPDATE is granted only on `full_name`, `default_rig_length`, `preferred_site_type_id`, `notification_preferences`, `bookmarked_campgrounds` (where present live). Any unclassified live column aborts the migration.

## 1. Policy / trigger / grant inventory (after apply)

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_roles')
ORDER BY tablename, cmd, policyname;
-- expect: profiles_select_own, profiles_update_own,
--         user_roles_select_authenticated
-- and NO "Restrict role changes to platform_admin"
-- and NO profiles_update_own_or_platform_admin

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND tgname = 'trg_restrict_profile_role_id_change';

-- Signup + companions on auth.users:
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
-- expect: on_auth_user_created → handle_new_user (AFTER INSERT)
-- and typically on_auth_user_updated → sync_email_on_update (AFTER UPDATE; kept)

SELECT
  has_table_privilege('anon', 'public.profiles', 'select') AS anon_sel_profiles,             -- false
  has_table_privilege('anon', 'public.profiles', 'truncate') AS anon_trunc_profiles,         -- false
  has_table_privilege('authenticated', 'public.profiles', 'insert') AS auth_ins_profiles,   -- false
  has_table_privilege('authenticated', 'public.profiles', 'delete') AS auth_del_profiles,   -- false
  has_table_privilege('authenticated', 'public.profiles', 'truncate') AS auth_trunc_profiles,-- false
  has_table_privilege('authenticated', 'public.profiles', 'references') AS auth_refs_profiles,-- false
  has_table_privilege('authenticated', 'public.profiles', 'trigger') AS auth_trig_profiles, -- false
  has_table_privilege('anon', 'public.user_roles', 'select') AS anon_sel_roles,               -- false
  has_table_privilege('authenticated', 'public.user_roles', 'select') AS auth_sel_roles,     -- true
  has_table_privilege('authenticated', 'public.user_roles', 'update') AS auth_upd_roles,     -- false
  has_table_privilege('authenticated', 'public.user_roles', 'delete') AS auth_del_roles,     -- false
  has_table_privilege('authenticated', 'public.user_roles', 'truncate') AS auth_trunc_roles, -- false
  has_table_privilege('authenticated', 'public.user_roles', 'references') AS auth_refs_roles,-- false
  has_table_privilege('authenticated', 'public.user_roles', 'trigger') AS auth_trig_roles;   -- false

SELECT has_function_privilege('anon', 'public.set_user_role(uuid, text)', 'execute') AS anon_exec_set_role;           -- false
SELECT has_function_privilege('authenticated', 'public.set_user_role(uuid, text)', 'execute') AS auth_exec_set_role; -- true

-- Final grant set from live catalog (safe if an allow-list col is missing).
-- Expect can_update = true ONLY for allow-list ∩ live:
--   full_name, default_rig_length, preferred_site_type_id,
--   notification_preferences, bookmarked_campgrounds
-- Expect false for every other live column (id, role_id, email, timestamps, …).
-- Paste into PR with §0 snapshot.
SELECT
  c.column_name,
  has_column_privilege('authenticated', 'public.profiles', c.column_name, 'update') AS can_update,
  c.column_name IN (
    'full_name',
    'default_rig_length',
    'preferred_site_type_id',
    'notification_preferences',
    'bookmarked_campgrounds'
  ) AS in_allow_list
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'profiles'
ORDER BY c.ordinal_position;
-- Expect: can_update = in_allow_list for every row (both true or both false).
```

## 2. Behavioral checks (PostgREST / Auth)

Use throwaway users via Auth Admin API; clean up with service role afterward.

| # | Attempt | Expected |
| --- | --- | --- |
| 1 | Non-admin `PATCH /profiles?id=eq.<me>` `{role_id: <platform_admin id>}` | **Fail** (`42501` column privilege and/or trigger); role stays `user`. Confirm with **service_role** `SELECT role_id` |
| 2 | Non-admin `PATCH` own `{full_name: "..."}` | **200**; `role_id` unchanged |
| 2b | Non-admin `PATCH` own `{email: "spoof@example.com"}` | **Fail** (`42501`); email unchanged (service_role re-SELECT) |
| 2c | **service_role** `PATCH` throwaway profile `{email: "trusted-sync@example.com"}` | **200**; service_role re-SELECT shows new email (trusted writer / `auth.role()` path) |
| 2d | Non-admin `PATCH` own on **any non-allow-listed column that exists live** (pick from §1 catalog where `in_allow_list = false`, e.g. `email` / `role_id` / `created_at` if present — do not assume a name) | **Fail** `42501` (no column UPDATE grant) |
| 2e | Change throwaway user email via **Auth API** (`updateUser` / Admin update email — not SQL Editor) | Auth update **succeeds** (no 500 from profile lock); service_role `GET profiles.email` **matches** new Auth email |
| 3 | Non-admin `DELETE` own profile | **0 rows** / denied; profile still present |
| 4 | Non-admin `POST` profile with `role_id = platform_admin` | **42501** RLS |
| 5 | Non-admin / anon `PATCH`/`POST`/`DELETE` on `user_roles` | Writes fail or **0 rows**; codes unchanged |
| 6 | Anon `GET /profiles` | **401/403** or **[]** (no privilege) |
| 7 | Auth `GET /user_roles` | All 4 lookup rows |
| 7b | Anon `GET /user_roles` | Denied / empty (SELECT is authenticated-only) |
| 8 | Auth `GET /profiles` (including platform_admin) | **Own row only** |
| 9 | Platform_admin `rpc/set_user_role` on another user → then **service_role** `GET /profiles?id=eq.<target>&select=role_id` | RPC **200**; service_role SELECT shows **new** `role_id` (do not trust RPC/PATCH 2xx alone) |
| 9b | Platform_admin raw `PATCH` other user's `role_id` | Should **not** change the row (no column privilege / own-only UPDATE); service_role SELECT confirms unchanged — use RPC instead |
| 10 | Public `signUp` with `user_metadata` roles (`role` / `role_id` / `app_role` = platform_admin) | New `profiles.role_id` = **1 (`user`)** |
| 10b | SQL inventory: non-internal triggers on `auth.users` | **Exactly two**: `on_auth_user_created` → `handle_new_user` (AFTER INSERT); `on_auth_user_updated` → `sync_email_on_update` (AFTER UPDATE OF email only). No other non-internal triggers |
| 10c | Email-less signup (Auth Admin create user with **no email** / phone-only if available, or insert path that yields `NEW.email` NULL) × **two** users | Both succeed; `profiles.email` is **NULL** (if nullable) or `<uuid>@no-email.invalid` (if NOT NULL) — **never** `''`; no UNIQUE collision on second signup |
| 11 | `rpc/current_user_role_code` as signed-in user | `"user"` / `"platform_admin"` matching profile (live helper; not redefined here) |
| 12 | Anon `GET /rest/v1/v_campgrounds` after apply | Same active count/sample as **before** apply (profiles `REVOKE ALL` from anon must not break public listing) |
| 13 | Platform_admin `set_user_role` demoting the **last** remaining platform_admin | **Fail** `P0001` / error; role unchanged |
| 13b | Optional: two concurrent demotions of each other (two SQL sessions) | One success + one **`P0001`** (not **`40P01`** deadlock) |
| 14 | Optional: remove `user` row from `user_roles` in a rolled-back transaction and attempt signup | Signup fails closed (`P0001`); restore role row |

## 3. Notes

- Admin role changes go through **`set_user_role`**, not PostgREST `PATCH` (own-only SELECT would make cross-user PATCH match 0 rows).
- Column UPDATE is granted only on `full_name`, `default_rig_length`, `preferred_site_type_id`, `notification_preferences`, `bookmarked_campgrounds` (where present live); any unclassified live column aborts the migration.
- Trusted writer bypass uses **`auth.role()`** / `request.jwt.claims` jsonb / legacy claim GUC, or **`session_user` in (`postgres`,`supabase_admin`)** — not `auth.uid() IS NULL`, and **not** general `supabase_auth_admin` (email sync uses a narrow Auth-email match).
- `handle_new_user` / `sync_email_on_update` share `_campy_normalize_profile_email` (NULL or `@no-email.invalid`; never `''`). Neither reads `raw_user_meta_data`.
- If `user_roles.code = 'user'` is missing, every signup fails closed (`P0001`) — intentional; keep that seed row.
- Owner picker (`get-owners.ts`) uses **service_role** (bypasses RLS).
