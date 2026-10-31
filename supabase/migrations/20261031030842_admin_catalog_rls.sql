-- Admin catalog RLS (defense in depth with requirePlatformAdmin()).
--
-- Scope: amenity_categories, amenities, campgrounds, sites,
--        campground_amenities, site_amenities, site_types
--        + grants/RPC for v_campgrounds_admin (public v_campgrounds left alone).
-- Intent:
--   * Lookups (categories, amenities, site_types, junctions): SELECT open.
--   * campgrounds / sites: split SELECT by role so anon never calls
--     is_platform_admin() (avoids EXECUTE privilege failures on public reads).
--   * INSERT / UPDATE / DELETE require platform_admin via is_platform_admin().
--   * v_campgrounds: NOT altered (unknown live def; security_invoker could
--     break anon listing if the view joins profiles/auth). Probe before change.
--   * v_campgrounds_admin: revoke direct SELECT from anon/authenticated;
--     expose only via SECURITY DEFINER RPC gated on is_platform_admin().
-- Out of scope (parked follow-up): profiles / user_roles policy dump.
--   is_platform_admin() still depends on live profiles.role_id protection.
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
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'True when auth.uid() has profiles.role_id → user_roles.code = platform_admin. Used by admin-catalog RLS. Depends on profiles.role_id not being self-writable (profiles/user_roles migrations follow-up).';

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

  -- campgrounds: split SELECT so anon never evaluates is_platform_admin()
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
    'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (active)',
    t || '_select_active_anon',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (active OR (SELECT public.is_platform_admin()))',
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

  -- sites: split SELECT; qualify sites.campground_id in the subquery
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
    'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (
      EXISTS (
        SELECT 1 FROM public.campgrounds AS c
        WHERE c.id = sites.campground_id AND c.active
      )
    )',
    t || '_select_active_park_anon',
    t
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
      (SELECT public.is_platform_admin())
      OR EXISTS (
        SELECT 1 FROM public.campgrounds AS c
        WHERE c.id = sites.campground_id AND c.active
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
-- Views
-- v_campgrounds: leave definition + invoker settings unchanged (unknown live
--   def; flipping security_invoker can break anon listing). Direct table RLS
--   still blocks inactive parks on /rest/v1/campgrounds.
-- v_campgrounds_admin: keep definer semantics (owner email joins must keep
--   working for admins). Revoke direct table SELECT; gate via RPC below.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Undo any earlier draft that set security_invoker on the public listing view.
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_campgrounds' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_campgrounds SET (security_invoker = false)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v_campgrounds_admin' AND c.relkind = 'v'
  ) THEN
    -- Definer semantics so owner email joins keep working for the RPC below.
    EXECUTE 'ALTER VIEW public.v_campgrounds_admin SET (security_invoker = false)';
    EXECUTE 'REVOKE ALL ON TABLE public.v_campgrounds_admin FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.v_campgrounds_admin FROM authenticated';
  END IF;
END $$;

-- Platform-admin-only read of the existing admin view (definer bypasses
-- profiles/auth.users grants that would break under security_invoker).
CREATE OR REPLACE FUNCTION public.get_campgrounds_admin(p_id uuid DEFAULT NULL)
RETURNS SETOF public.v_campgrounds_admin
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v.*
  FROM public.v_campgrounds_admin AS v
  WHERE p_id IS NULL OR v.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_campgrounds_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campgrounds_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campgrounds_admin(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_campgrounds_admin(uuid) IS
  'Returns v_campgrounds_admin rows only for platform_admin. Direct SELECT on the view is revoked from anon/authenticated.';

COMMIT;
