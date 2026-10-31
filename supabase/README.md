# Supabase (Campy)

Schema and RLS currently live primarily in the hosted Supabase project. This folder starts committing reviewable SQL so policies do not drift from git.

## Layout

| Path | Purpose |
| --- | --- |
| `migrations/` | Ordered SQL migrations (apply in filename order) |
| `probes/` | Manual verification notes / SQL checklists |

There is no `config.toml` yet — the CLI is optional. Applying via the Supabase Dashboard SQL Editor is enough.

## Apply a migration

1. Open the Campy project in [Supabase Dashboard](https://supabase.com/dashboard) → **SQL** → New query.
2. Paste the full contents of the next unapplied file under `migrations/` (e.g. `20261031030842_admin_catalog_rls.sql`).
3. Run it. Re-runs are intended to be idempotent for this migration.
4. Optionally mark progress in a team note / migration history table later.

### Optional: Supabase CLI

If you link the project locally:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Admin catalog RLS (`20261031030842_admin_catalog_rls.sql`)

**Tables:** `amenity_categories`, `amenities`, `campgrounds`, `sites`, `campground_amenities`, `site_amenities`, `site_types`

**Policies (each table):**

- `*_select_all` — `SELECT` for `anon` + `authenticated` (`USING (true)`) so guest `v_campgrounds` / admin form lookups keep working
- `*_insert_platform_admin` / `*_update_platform_admin` / `*_delete_platform_admin` — writes only when `is_platform_admin()` is true

**Helper:** `public.is_platform_admin()` — `SECURITY DEFINER` check that `auth.uid()`’s `profiles.role_id` maps to `user_roles.code = 'platform_admin'`.

This backs `requirePlatformAdmin()` in the app: a missed action gate still cannot mutate catalog rows as a normal user.

**Not in this migration:** `profiles` / `user_roles` policies and the signup trigger (tracked separately).

After applying, walk through `probes/admin-catalog-rls.md`.
