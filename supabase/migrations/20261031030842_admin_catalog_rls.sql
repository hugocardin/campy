-- Admin catalog RLS (defense in depth with requirePlatformAdmin()).
--
-- Scope: amenity_categories, amenities, campgrounds, sites,
--        campground_amenities, site_amenities, site_types.
-- Intent:
--   * SELECT stays open for anon + authenticated (guest views / admin forms /
--     existing PostgREST read paths keep working).
--   * INSERT / UPDATE / DELETE require platform_admin via is_platform_admin().
-- Out of scope: profiles / user_roles (separate follow-up migration).
--
-- Apply via Supabase SQL Editor or `supabase db push` (see supabase/README.md).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Helper: current JWT user is platform_admin
-- SECURITY DEFINER so the join can read profiles/user_roles under RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'True when auth.uid() has profiles.role_id → user_roles.code = platform_admin. Used by admin-catalog RLS write policies.';

-- ---------------------------------------------------------------------------
-- Drop every policy on a table, then enable RLS (known-good rebuild).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._campy_drop_all_policies(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = p_schema
      AND tablename = p_table
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      p_schema,
      p_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._campy_drop_all_policies(text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Per-table: enable RLS + public SELECT + platform_admin writes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'amenity_categories',
    'amenities',
    'campgrounds',
    'sites',
    'campground_amenities',
    'site_amenities',
    'site_types'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    PERFORM public._campy_drop_all_policies('public', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t || '_select_all',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin())',
      t || '_insert_platform_admin',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
      t || '_update_platform_admin',
      t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_platform_admin())',
      t || '_delete_platform_admin',
      t
    );
  END LOOP;
END $$;

-- Temporary helper only used by this migration.
DROP FUNCTION IF EXISTS public._campy_drop_all_policies(text, text);
