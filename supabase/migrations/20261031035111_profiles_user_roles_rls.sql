-- Profiles / user_roles RLS, grants, and signup trigger.
--
-- Captures live intent previously only on the hosted project (Issue #2 / PR #6
-- parked follow-up). Behavioral probes on live showed:
--   * Policy name "Restrict role changes to platform_admin" rejected non-admin
--     role_id updates with 42501; platform_admin could still change role_id.
--   * Own-row SELECT; UPDATE own or platform_admin; no auth INSERT/DELETE.
--   * user_roles SELECT open; writes denied for anon/authenticated.
--   * Signup always assigns user_roles.code = 'user' (ignores user_metadata).
--
-- Hugo (PR #6): locking role changes must use column-level REVOKE on
-- profiles.role_id OR a BEFORE UPDATE trigger — NOT only a row-level WITH CHECK
-- (RLS cannot see OLD). Live admin role assignment via PostgREST requires the
-- platform_admin exception, so this migration uses a trigger (not REVOKE).
-- The old WITH CHECK-only policy is dropped and replaced by the trigger.
--
-- Depends on public.is_platform_admin() from 20261031030842_admin_catalog_rls.sql.
--
-- Apply as one script in the SQL Editor (or `supabase db push` after link).
-- Wrapped in a transaction. Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Role-change lock: BEFORE UPDATE trigger (replaces WITH CHECK-only policy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_profile_role_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    -- SQL Editor / migrations / service_role without an end-user JWT.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;

    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Only platform_admin can change role_id'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM anon;
REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM authenticated;

COMMENT ON FUNCTION public.restrict_profile_role_id_change() IS
  'BEFORE UPDATE on profiles: reject role_id changes unless caller is platform_admin (or auth.uid() is null). Replaces live WITH CHECK policy "Restrict role changes to platform_admin".';

DROP TRIGGER IF EXISTS trg_restrict_profile_role_id_change ON public.profiles;
CREATE TRIGGER trg_restrict_profile_role_id_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_profile_role_id_change();

-- ---------------------------------------------------------------------------
-- Signup: create profile with default role "user" (ignore user_metadata roles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  default_role_id integer;
BEGIN
  SELECT r.id
  INTO default_role_id
  FROM public.user_roles AS r
  WHERE r.code = 'user'
  LIMIT 1;

  IF default_role_id IS NULL THEN
    RAISE EXCEPTION 'user_roles row with code=user is required for signup'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, email, role_id)
  VALUES (NEW.id, NEW.email, default_role_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT on auth.users: insert profiles row with role_id for user_roles.code = user. Does not read role from raw_user_meta_data.';

-- Drop any existing trigger that already calls handle_new_user (name may differ live).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger AS t
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  LOOP
    RAISE NOTICE 'Dropping auth.users trigger % (handle_new_user)', r.tgname;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
  END LOOP;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS policies (drop existing on these tables, then recreate)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  -- profiles
  t := 'profiles';
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t
  LOOP
    RAISE NOTICE 'Dropping policy %.% : %', 'public', t, pol.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
  END LOOP;

  -- SELECT: own row only (platform_admin owner picker uses service_role).
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (id = (SELECT auth.uid()))',
    'profiles_select_own',
    t
  );

  -- UPDATE: own row, or any row when platform_admin (role_id lock is the trigger).
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
      id = (SELECT auth.uid()) OR (SELECT public.is_platform_admin())
    ) WITH CHECK (
      id = (SELECT auth.uid()) OR (SELECT public.is_platform_admin())
    )',
    'profiles_update_own_or_platform_admin',
    t
  );

  -- No INSERT / DELETE policies for anon/authenticated (signup trigger + cascade).

  -- user_roles
  t := 'user_roles';
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
    'user_roles_select_all',
    t
  );

  -- No write policies for anon/authenticated (lookup table; mutate via SQL/service_role).
END $$;

-- ---------------------------------------------------------------------------
-- Grants (table-level; role_id left updatable so platform_admin PostgREST works;
-- non-admins are blocked by the trigger above)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.profiles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;
GRANT SELECT ON TABLE public.user_roles TO anon;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

COMMIT;
