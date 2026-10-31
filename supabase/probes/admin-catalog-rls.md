# Probe: admin catalog RLS

Run **after** applying `migrations/20261031030842_admin_catalog_rls.sql`.

Live agent environments need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to automate this. Without them, use the Dashboard SQL editor + an ephemeral Auth user.

## 1. Policy inventory (SQL Editor)

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'amenity_categories',
    'amenities',
    'campgrounds',
    'sites',
    'campground_amenities',
    'site_amenities',
    'site_types'
  )
ORDER BY tablename, cmd, policyname;
```

Expect four policies per table: `*_select_all`, `*_insert_platform_admin`, `*_update_platform_admin`, `*_delete_platform_admin`.

```sql
SELECT public.is_platform_admin(); -- null/false when not signed in as platform_admin
```

## 2. Behavioral checks (PostgREST / app client)

Use a **non–platform-admin** signed-in user (and anon):

| Attempt | Expected |
| --- | --- |
| `SELECT` amenities / categories / site_types / junctions | Rows returned (guest/admin form reads) |
| `SELECT` `v_campgrounds` | Active parks only (unchanged) |
| `INSERT` / `UPDATE` / `DELETE` on each catalog table | `42501` or **0 rows** mutated; real seed rows unchanged |
| Platform admin session same writes | Succeeds (same as today’s Server Actions) |

Throwaway rows only: create via **service role**, attempt delete/update as normal user, then clean up with service role.

## 3. App smoke (optional)

As platform admin in the UI: category → amenity → campground amenities → site amenities still works (actions still call `requirePlatformAdmin()`; RLS is the second gate).
