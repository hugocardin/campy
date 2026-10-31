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
2. **Before apply:** snapshot existing policies (paste into PR / notes):

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

3. Paste the full contents of the next unapplied file under `migrations/` (e.g. `20261031030842_admin_catalog_rls.sql`).
4. Run it. The script is one `BEGIN`…`COMMIT` transaction (partial apply rolls back). Watch `NOTICE` lines for every dropped policy name.
5. If you later adopt the Supabase CLI, mark this version applied so `db push` does not re-run it:

   ```bash
   npx supabase init   # once, if you want config.toml + CLI workflow
   npx supabase link --project-ref <project-ref>
   npx supabase migration repair --status applied 20261031030842
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
| `campgrounds` | `active OR is_platform_admin()` | `is_platform_admin()` |
| `sites` | parent park `active` OR `is_platform_admin()` | `is_platform_admin()` |

Write policies use `(SELECT public.is_platform_admin())` (initPlan once per statement).

**Helper:** `public.is_platform_admin()` — `SECURITY DEFINER`, `search_path = ''`, `EXECUTE` granted to `authenticated` only.

**Views:** `v_campgrounds` / `v_campgrounds_admin` set `security_invoker = true`; `REVOKE ALL … FROM anon` on `v_campgrounds_admin`.

**Dependency:** this second gate is only as strong as live `profiles.role_id` / `user_roles` protection (verify with the probe; full policy commit is a later follow-up).

After applying, walk through `probes/admin-catalog-rls.md`.
