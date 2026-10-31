-- Profiles / user_roles RLS, grants, signup trigger, and admin role RPC.
--
-- Captures live intent previously only on the hosted project (Issue #2 / PR #6
-- parked follow-up). Behavioral probes on live showed:
--   * Policy name "Restrict role changes to platform_admin" rejected non-admin
--     role_id updates with 42501; platform_admin could still change role_id.
--   * Own-row SELECT; no auth INSERT/DELETE on profiles.
--   * user_roles SELECT open to clients that need the lookup; writes denied.
--   * Signup always assigns user_roles.code = 'user' (ignores user_metadata).
--
-- Hugo (PR #6 / #7): locking role_id must use column-level REVOKE / grants OR a
-- BEFORE UPDATE trigger — NOT only a row-level WITH CHECK. PR #7: own-only
-- SELECT + admin UPDATE branch silently no-ops PostgREST PATCH on other rows
-- (SELECT policies apply to UPDATE/RETURNING). Fix: column grants for
-- user-editable fields + SECURITY DEFINER set_user_role() for admin role
-- assignment; SELECT/UPDATE stay own-row only. Trigger remains as defense
-- in depth (role_id / email / id + last-admin guard).
--
-- Depends on public.is_platform_admin() from 20261031030842_admin_catalog_rls.sql.
--
-- Apply as one script in the SQL Editor (or `supabase db push` after link).
-- Wrapped in a transaction. Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers: trusted writer? (JWT service_role or DB superuser session)
-- Not granted to anon/authenticated — trigger/RPC only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._campy_is_trusted_profile_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin');
$$;

REVOKE ALL ON FUNCTION public._campy_is_trusted_profile_writer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._campy_is_trusted_profile_writer() FROM anon;
REVOKE ALL ON FUNCTION public._campy_is_trusted_profile_writer() FROM authenticated;

COMMENT ON FUNCTION public._campy_is_trusted_profile_writer() IS
  'True for service_role JWT or session_user postgres/supabase_admin. Used by profile role/email lock — not a missing-sub bypass.';

-- ---------------------------------------------------------------------------
-- Role-change + server-owned column lock (defense in depth with column grants)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restrict_profile_role_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  platform_admin_role_id integer;
  other_admins integer;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- email is server-owned (Auth / trusted writers). Column grants also omit it.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    IF NOT public._campy_is_trusted_profile_writer() THEN
      RAISE EXCEPTION 'Only a trusted server path can change profiles.email'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    IF public._campy_is_trusted_profile_writer() THEN
      NULL; -- SQL Editor / service_role; still apply last-admin unless DB owner
    ELSIF public.is_platform_admin() THEN
      NULL; -- admin via set_user_role (SECURITY DEFINER) or future paths
    ELSE
      RAISE EXCEPTION 'Only platform_admin can change role_id'
        USING ERRCODE = '42501';
    END IF;

    -- Refuse leaving zero platform_admin profiles (except postgres/supabase_admin recovery).
    IF session_user NOT IN ('postgres', 'supabase_admin') THEN
      SELECT r.id
      INTO platform_admin_role_id
      FROM public.user_roles AS r
      WHERE r.code = 'platform_admin'
      LIMIT 1;

      IF platform_admin_role_id IS NOT NULL
         AND OLD.role_id = platform_admin_role_id
         AND NEW.role_id IS DISTINCT FROM platform_admin_role_id THEN
        SELECT COUNT(*)::integer
        INTO other_admins
        FROM public.profiles AS p
        WHERE p.role_id = platform_admin_role_id
          AND p.id IS DISTINCT FROM OLD.id;

        IF other_admins = 0 THEN
          RAISE EXCEPTION 'cannot demote the last platform_admin'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM anon;
REVOKE ALL ON FUNCTION public.restrict_profile_role_id_change() FROM authenticated;

COMMENT ON FUNCTION public.restrict_profile_role_id_change() IS
  'BEFORE UPDATE on profiles: lock id/email/role_id. role_id changes require platform_admin or trusted writer; blocks demoting the last platform_admin (except postgres/supabase_admin). Replaces live WITH CHECK policy "Restrict role changes to platform_admin".';

DROP TRIGGER IF EXISTS trg_restrict_profile_role_id_change ON public.profiles;
CREATE TRIGGER trg_restrict_profile_role_id_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_profile_role_id_change();

-- ---------------------------------------------------------------------------
-- Admin role assignment RPC (avoids SELECT/UPDATE RLS interaction on other rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_role_id integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform_admin required'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.id
  INTO new_role_id
  FROM public.user_roles AS r
  WHERE r.code = p_role_code
  LIMIT 1;

  IF new_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role_code: %', p_role_code
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles AS p
  SET
    role_id = new_role_id,
    updated_at = now()
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_user_role(uuid, text) IS
  'platform_admin-only: set profiles.role_id by user_roles.code. Prefer this over PostgREST PATCH (own-only SELECT would filter other rows). Last-admin guard lives in restrict_profile_role_id_change trigger.';

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

  -- email may be null for phone / OAuth-without-email; store empty string if NOT NULL.
  INSERT INTO public.profiles (id, email, role_id)
  VALUES (NEW.id, COALESCE(NEW.email, ''), default_role_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT on auth.users: insert profiles row with role_id for user_roles.code = user. Does not read role from raw_user_meta_data. Email copied once (not kept in sync with later Auth email changes).';

-- Install signup trigger: replace only handle_new_user callers; refuse other
-- auth.users triggers (including a differently wired on_auth_user_created).
DO $$
DECLARE
  r record;
  leftover text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT t.tgname, n.nspname, p.proname
    FROM pg_trigger AS t
    JOIN pg_proc AS p ON p.oid = t.tgfoid
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
  LOOP
    IF r.nspname = 'public' AND r.proname = 'handle_new_user' THEN
      RAISE NOTICE 'Dropping auth.users trigger % (public.handle_new_user)', r.tgname;
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.tgname);
    ELSIF r.tgname = 'on_auth_user_created' THEN
      RAISE EXCEPTION
        'auth.users trigger on_auth_user_created points at %.% — review/remove before apply (refusing silent replace)',
        r.nspname, r.proname
        USING ERRCODE = 'P0001';
    ELSE
      leftover := array_append(
        leftover,
        format('%s → %I.%I', r.tgname, r.nspname, r.proname)
      );
    END IF;
  END LOOP;

  IF coalesce(array_length(leftover, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'Refusing to install on_auth_user_created: other non-internal triggers on auth.users must be reviewed/removed first: %',
      array_to_string(leftover, ', ')
      USING ERRCODE = 'P0001';
  END IF;
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

  -- SELECT: own row only (owner picker uses service_role; admin role via RPC).
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (id = (SELECT auth.uid()))',
    'profiles_select_own',
    t
  );

  -- UPDATE: own row only (no admin branch — set_user_role is SECURITY DEFINER).
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
      id = (SELECT auth.uid())
    ) WITH CHECK (
      id = (SELECT auth.uid())
    )',
    'profiles_update_own',
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

  -- authenticated only (anon does not need privileged role code enumeration).
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
    'user_roles_select_authenticated',
    t
  );

  -- No write policies for anon/authenticated (lookup table; mutate via SQL/service_role).
END $$;

-- ---------------------------------------------------------------------------
-- Grants: revoke ALL defaults, then grant only what clients need
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;
-- User-editable columns only (not role_id, email, id, created_at).
GRANT UPDATE (
  full_name,
  default_rig_length,
  preferred_site_type_id,
  notification_preferences,
  bookmarked_campgrounds
) ON TABLE public.profiles TO authenticated;

GRANT SELECT ON TABLE public.user_roles TO authenticated;

COMMIT;
