-- Admin catalog RLS (defense in depth with requirePlatformAdmin()).
--
-- Scope: amenity_categories, amenities, campgrounds, sites,
--        campground_amenities, site_amenities, site_types
--        + view invoker/grants for v_campgrounds / v_campgrounds_admin.
-- Intent:
--   * Lookups (categories, amenities, site_types, junctions): SELECT open.
--   * campgrounds: SELECT only when active OR caller is platform_admin
--     (blocks anon from reading inactive drafts / owner_id via base table).
--   * sites: SELECT when parent campground is active OR platform_admin
--     (sites have no active column; visibility follows the park).
--   * INSERT / UPDATE / DELETE require platform_admin via is_platform_admin().
--   * Views use security_invoker so base-table RLS applies; admin view
--     revoked from anon (owner email must not be public).
-- Out of scope (separate follow-up): profiles / user_roles policy dump.
--   is_platform_admin() still depends on live profiles.role_id protection
--   (previously probed: "Restrict role changes to platform_admin").
--
-- Apply as one script in the SQL Editor (or `supabase db push` after link).
-- Wrapped in a transaction so a mid-script error rolls back entirely.
-- Idempotent: safe to re-run (re-drops then recreates these policies).

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: current JWT user is platform_admin
-- SECURITY DEFINER so the join can read profiles/user_roles under RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    INNER JOIN public.user_roles AS r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND r.code = 'platform_admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'True when auth.uid() has profiles.role_id → user_roles.code = platform_admin. Used by admin-catalog RLS. Depends on profiles.role_id not being self-writable.';

-- ---------------------------------------------------------------------------
-- Per-table: enable RLS, notice+drop existing policies, recreate
-- (inline — no temporary SECURITY DEFINER drop helper exposed via PostgREST)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol record;
  lookup_tables text[] := ARRAY[
    'amenity_categories',
    'amenities',
    'campground_amenities',
    'site_amenities',
    'site_types'
  ];
BEGIN
  -- Lookups + junctions: open SELECT, platform_admin writes
  FOREACH t IN ARRAY lookup_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      RAISE NOTICE 'Dropping policy %.% : %', 'public', t, pol.policyname;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t || '_select_all',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_platform_admin()))',
      t || '_insert_platform_admin',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()))',
      t || '_update_platform_admin',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_platform_admin()))',
      t || '_delete_platform_admin',
      t
    );
  END LOOP;

  -- campgrounds: active-only for public; full access for platform_admin
  t := 'campgrounds';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t
  LOOP
    RAISE NOTICE 'Dropping policy %.% : %', 'public', t, pol.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (active OR (SELECT public.is_platform_admin()))',
    t || '_select_active_or_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_platform_admin()))',
    t || '_insert_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()))',
    t || '_update_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_platform_admin()))',
    t || '_delete_platform_admin',
    t
  );

  -- sites: visible when parent park is active, or caller is platform_admin
  t := 'sites';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t
  LOOP
    RAISE NOTICE 'Dropping policy %.% : %', 'public', t, pol.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (
      (SELECT public.is_platform_admin())
      OR EXISTS (
        SELECT 1 FROM public.campgrounds AS c
        WHERE c.id = campground_id AND c.active
      )
    )',
    t || '_select_active_park_or_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_platform_admin()))',
    t || '_insert_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()))',
    t || '_update_platform_admin',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_platform_admin()))',
    t || '_delete_platform_admin',
    t
  );
END $$;

-- ---------------------------------------------------------------------------
-- Views: enforce invoker RLS; keep owner PII off the anon role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_campgrounds' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_campgrounds SET (security_invoker = true)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_campgrounds_admin' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_campgrounds_admin SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.v_campgrounds_admin FROM anon';
    -- Authenticated may SELECT; row contents still filtered by base-table RLS
    -- (platform_admin sees all parks; others only active). Owner columns still
    -- subject to profiles RLS under security_invoker.
    EXECUTE 'GRANT SELECT ON TABLE public.v_campgrounds_admin TO authenticated';
  END IF;
END $$;

COMMIT;
