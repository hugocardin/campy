# Supabase (Campy)

Schema and RLS currently live primarily in the hosted Supabase project. This folder starts committing reviewable SQL so policies do not drift from git.

## Layout

| Path | Purpose |
| --- | --- |
| `migrations/` | Ordered SQL migrations (apply in filename order) |
| `probes/` | Manual verification notes / SQL checklists |

There is no full CLI project yet (`config.toml` optional). Prefer **one** apply path per migration to avoid history drift.

## Apply path (pick one)

### A. Supabase Dashboard SQL Editor (current default)

1. Open Campy in [Supabase Dashboard](https://supabase.com/dashboard) → **SQL** → New query.
2. **Before apply:** snapshot existing policies (paste into PR / notes). Example for catalog RLS:

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

   For profiles / user_roles, see the snapshot queries in `probes/profiles-user-roles-rls.md`.

3. Paste the full contents of the next unapplied file under `migrations/` (apply in filename order).
4. Run it. The script is one `BEGIN`…`COMMIT` transaction (partial apply rolls back). Watch `NOTICE` lines for every dropped policy name.
5. If you later adopt the Supabase CLI, mark each SQL-Editor-applied version so `db push` does not re-run it:

   ```bash
   npx supabase init   # once, if you want config.toml + CLI workflow
   npx supabase link --project-ref <project-ref>
   npx supabase migration repair --status applied 20261031030842
   npx supabase migration repair --status applied 20261031035111
   ```

   Without `repair`, a later `db push` would re-execute the file (idempotent today, but it re-drops/recreates policies and would wipe hand-edits made since).

### B. Supabase CLI only

```bash
npx supabase init
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Do **not** mix “SQL Editor apply” and “`db push`” for the same version unless you `migration repair` as above.

## Admin catalog RLS (`20261031030842_admin_catalog_rls.sql`)

**Tables:** `amenity_categories`, `amenities`, `campgrounds`, `sites`, `campground_amenities`, `site_amenities`, `site_types`

**Policies:**

| Relation | SELECT | Writes |
| --- | --- | --- |
| Lookups + junctions | open (`anon`/`authenticated`) | `is_platform_admin()` |
| `campgrounds` | **split:** anon `active`; authenticated `active OR is_platform_admin()` | `is_platform_admin()` |
| `sites` | **split:** anon parent-active; authenticated parent-active OR admin | `is_platform_admin()` |

Write policies (and authenticated SELECT admin branches) use `(SELECT public.is_platform_admin())` (initPlan once per statement). Anon SELECT policies never call the function.

**Helper:** `public.is_platform_admin()` — `SECURITY DEFINER`, `search_path = ''`, `EXECUTE` for `authenticated` only (`REVOKE` from `PUBLIC` and `anon`).

**Views:**

- `v_campgrounds` — **unchanged** (migration does not `ALTER` it). Snapshot `reloptions` / `pg_get_viewdef` before apply.
- `v_campgrounds_admin` — direct `SELECT` revoked from `anon`/`authenticated` (no `security_invoker` flip); app reads via `get_campgrounds_admin(p_id uuid DEFAULT NULL)` RPC (`42501` if not platform_admin; `ORDER BY name`).

**owner_id on active parks:** intentionally still readable by anon on the base table (UUID only; not treated as secret). Column revoke deferred unless product says otherwise.

**Dependency:** admin catalog RLS trusts `profiles.role_id` / `user_roles` protection from `20261031035111_profiles_user_roles_rls.sql` (trigger + grants).

After applying, walk through `probes/admin-catalog-rls.md`.

## Profiles / user_roles (`20261031035111_profiles_user_roles_rls.sql`)

**Apply after** `20261031030842` (`is_platform_admin()`).

| Relation | SELECT | Writes | Role lock |
| --- | --- | --- | --- |
| `profiles` | own row (`authenticated`) | UPDATE own **or** `is_platform_admin()`; no auth INSERT/DELETE | **BEFORE UPDATE trigger** `trg_restrict_profile_role_id_change` — non-admins cannot change `role_id`; platform_admin can (PostgREST). Not column `REVOKE` (would block admin). |
| `user_roles` | open (`anon`/`authenticated`) | no policies; `INSERT`/`UPDATE`/`DELETE` revoked for `anon`/`authenticated` | n/a |

**Signup:** `handle_new_user` on `auth.users` AFTER INSERT → `profiles` with `user_roles.code = 'user'`. Ignores `raw_user_meta_data` role keys.

**Replaces** live WITH CHECK-only policy `"Restrict role changes to platform_admin"` (Hugo: RLS cannot see `OLD`; trigger is the reviewable lock).

After applying, walk through `probes/profiles-user-roles-rls.md`.
