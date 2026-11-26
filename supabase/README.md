# Supabase (Campy)

Schema and RLS currently live primarily in the hosted Supabase project. This folder starts committing reviewable SQL so policies do not drift from git.

**Guest search geocoder (#24):** Photon (Komoot) — see `probes/search-v2-place-unaccent.md`. Optional `PHOTON_API_URL`; no API key.

**Park media (Phase C):** public Storage bucket `park-media` + `campgrounds.cover_photo` + `sites.photos` — see `probes/park-media-storage.md` and migration `20261125025950_park_media_storage.sql`. Orphan cleanup: admin sweep + periodic cron on `/api/cron/park-media-orphan-sweep` (enable steps + `CRON_SECRET` in that probe).

## Layout

| Path | Purpose |
| --- | --- |
| `migrations/` | Ordered SQL migrations (apply in filename order) |
| `probes/` | Manual verification notes / SQL checklists |

There is no full CLI project yet (`config.toml` optional). Prefer **one** apply path per migration to avoid history drift.

### Naming rule (avoid version drift)

When applying via MCP `apply_migration`, Dashboard SQL Editor, or any path that stamps its own version into `supabase_migrations.schema_migrations`: **apply first**, then name the local file from the version `list_migrations` / `schema_migrations` returns. Never invent the `YYYYMMDDHHMMSS` timestamp by hand — that is what produced the rename syncs in #64 / #65 / #68.

### Transactions

Prefer wrapping each script in one `BEGIN`…`COMMIT` so a partial apply rolls back. Some apply paths already wrap the script; when they do, an explicit transaction in the file is aspirational / documentation, not a second nested boundary.

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
4. Run it. Prefer one `BEGIN`…`COMMIT` in the script (see Transactions above). Watch `NOTICE` lines for every dropped policy name.
5. Rename the local file to the version recorded in `schema_migrations` (see Naming rule).
6. If you later adopt the Supabase CLI, mark each SQL-Editor-applied version so `db push` does not re-run it:

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

### Local / preview repair after version sync (#68)

Hosted Campy already uses the live versions below. If a local `supabase start` DB, preview branch, or teammate DB applied a file under an old repo timestamp, repair after pulling the rename:

```bash
# protect_site_type_codes (#66 → live)
supabase migration repair --status reverted 20261125183000
supabase migration repair --status applied 20261125182821

# remaining history sync (old repo timestamp → live)
supabase migration repair --status reverted 20261116062701 && supabase migration repair --status applied 20261116062709
supabase migration repair --status reverted 20261116064012 && supabase migration repair --status applied 20261116063554
supabase migration repair --status reverted 20261116064530 && supabase migration repair --status applied 20261116064207
supabase migration repair --status reverted 20261116135025 && supabase migration repair --status applied 20261116135119
supabase migration repair --status reverted 20261116140131 && supabase migration repair --status applied 20261116140211
supabase migration repair --status reverted 20261116154127 && supabase migration repair --status applied 20261116154552
supabase migration repair --status reverted 20261116155256 && supabase migration repair --status applied 20261116155510
supabase migration repair --status reverted 20261116155730 && supabase migration repair --status applied 20261116155733
supabase migration repair --status reverted 20261116160012 && supabase migration repair --status applied 20261116155939
supabase migration repair --status reverted 20261116160145 && supabase migration repair --status applied 20261116160126
supabase migration repair --status reverted 20261116162000 && supabase migration repair --status applied 20261116161614
supabase migration repair --status reverted 20261116162530 && supabase migration repair --status applied 20261116162158
supabase migration repair --status reverted 20261125032045 && supabase migration repair --status applied 20261125031840
supabase migration repair --status reverted 20261125033810 && supabase migration repair --status applied 20261125033936
supabase migration repair --status reverted 20261125044000 && supabase migration repair --status applied 20261125034720
```

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
| `profiles` | own row (`authenticated`) | `GRANT UPDATE` = **allow-list ∩ live** (`full_name`, `default_rig_length`, `preferred_rig_unit`, `preferred_site_type_id`, `notification_preferences`, `bookmarked_campgrounds`); unexpected live cols → **RAISE**. Canonical helper: `private.grant_profiles_authenticated_update_allowlist(text[])` (`20261116140211_*`). `default_rig_length` is **feet** (COMMENT in `20261116062709_*`; metres convert at the app edge like `sites.max_rig_length`). `preferred_rig_unit` is `ft`/`m`/NULL (COMMENT + CHECK in `20261116135119_*`; NULL → locale fallback). CHECKs + `trg_profiles_set_updated_at` in `20261116063554_*` (name 1–120 trimmed / NULL; rig `(0, 200]` / NULL; `updated_at` on every UPDATE; tightened in `20261116064207_*`) | **`set_user_role(user_id, role_code)`** RPC (`SECURITY DEFINER`, `platform_admin` only). Own-only SELECT would make cross-user `PATCH` match 0 rows. |
| `user_roles` | `authenticated` only (not `anon`) | none — `REVOKE ALL` then no write grants | n/a |

**Defense in depth:** `BEFORE UPDATE` trigger `trg_restrict_profile_role_id_change` locks `id` / `email` / `role_id`. Trusted writers (`auth.role()` / jwt claims = `service_role`, or `session_user` ∈ (`postgres`,`supabase_admin`)) — **not** `supabase_auth_admin` generally. Email sync from GoTrue is allowed only when `session_user = supabase_auth_admin` and `profiles.email` matches normalized `auth.users.email`. Role changes: `is_platform_admin()` or trusted writer; last-admin via advisory xact lock then `COUNT` (no `FOR UPDATE`).

**Grants:** `REVOKE ALL` on both tables from `anon`/`authenticated`, then minimal grants (clears default `TRUNCATE` / `REFERENCES` / `TRIGGER` too). Column UPDATE = allow-list ∩ live `information_schema` columns; unexpected live cols abort apply.

**Signup / email sync:** `handle_new_user` (AFTER INSERT) and versioned `sync_email_on_update` (AFTER UPDATE OF email) share `_campy_normalize_profile_email` (NULL if nullable, else `id@no-email.invalid`; never `''`). Ignores `raw_user_meta_data`.

Migration inventories **live** `auth.users` triggers **before** recreating sync: RAISE if `on_auth_user_updated` points elsewhere; drop `handle_new_user` callers; then `CREATE OR REPLACE sync_email_on_update` (intentional email-only) + recreate companion + signup trigger. Idempotent for re-apply.

**Notes / failure modes:**

- Snapshot `information_schema.columns` / `pg_indexes` for `profiles.email` before apply (nullability + unique).
- After apply: probe Auth API email change (not SQL Editor) and confirm `profiles.email` matches.
- If `user_roles` has no `code = 'user'` row, **every signup fails closed** (`P0001`) — keep that seed row.
- After `REVOKE ALL … FROM anon` on `profiles`, confirm anon `GET /v_campgrounds` still works (view may join profiles as invoker).

**Replaces** live WITH CHECK-only policy `"Restrict role changes to platform_admin"`.

After applying, walk through `probes/profiles-user-roles-rls.md`.
