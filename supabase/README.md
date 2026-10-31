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

**Dependency:** admin catalog RLS trusts `profiles.role_id` / `user_roles` protection from `20261031035111_profiles_user_roles_rls.sql` (column grants + `set_user_role` + trigger).

After applying, walk through `probes/admin-catalog-rls.md`.

## Profiles / user_roles (`20261031035111_profiles_user_roles_rls.sql`)

**Apply after** `20261031030842` (`is_platform_admin()`).

| Relation | SELECT | Client writes | Role assignment |
| --- | --- | --- | --- |
| `profiles` | own row (`authenticated`) | dynamic `GRANT UPDATE` on live cols except server-owned (`id`, `role_id`, `email`, `created_at`, `updated_at`); expected editable: `full_name`, `default_rig_length`, `preferred_site_type_id`, `notification_preferences`, `bookmarked_campgrounds` | **`set_user_role(user_id, role_code)`** RPC (`SECURITY DEFINER`, `platform_admin` only). Own-only SELECT would make cross-user `PATCH` match 0 rows. |
| `user_roles` | `authenticated` only (not `anon`) | none — `REVOKE ALL` then no write grants | n/a |

**Defense in depth:** `BEFORE UPDATE` trigger `trg_restrict_profile_role_id_change` locks `id` / `email` / `role_id`, allows trusted writers (`auth.role()` / jwt claims = `service_role`, or `session_user` ∈ (`postgres`,`supabase_admin`)) or `is_platform_admin()`, and refuses demoting the **last** `platform_admin` (advisory xact lock + `FOR UPDATE`; DB owners can still recover in SQL Editor).

**Grants:** `REVOKE ALL` on both tables from `anon`/`authenticated`, then minimal grants (clears default `TRUNCATE` / `REFERENCES` / `TRIGGER` too). Column UPDATE list is built from `information_schema` at apply time.

**Signup:** `handle_new_user` on `auth.users` AFTER INSERT → `profiles` with `user_roles.code = 'user'`. Email-less: keep `NULL` if `profiles.email` is nullable; otherwise `id::text || '@no-email.invalid'` (never `''`). Ignores `raw_user_meta_data` role keys.

Migration drops triggers that call `public.handle_new_user`. It does **not** silently `DROP TRIGGER on_auth_user_created` when that name points at a different function — it **RAISE**s instead. Same for any other leftover non-internal `auth.users` trigger. Review and remove conflicting triggers, then re-apply.

**Notes / failure modes:**

- `profiles.email` is copied **once** at signup — later Auth email changes are **not** synced (owner picker / admin listing can drift until a sync path exists).
- Snapshot `information_schema.columns` / `pg_indexes` for `profiles.email` before apply (nullability + unique).
- If `user_roles` has no `code = 'user'` row, **every signup fails closed** (`P0001`) — keep that seed row.
- After `REVOKE ALL … FROM anon` on `profiles`, confirm anon `GET /v_campgrounds` still works (view may join profiles as invoker).

**Replaces** live WITH CHECK-only policy `"Restrict role changes to platform_admin"`.

After applying, walk through `probes/profiles-user-roles-rls.md`.
