-- Issue #42 step 2: remember the guest's preferred rig display unit (ft / m).
-- Profile form (and later guest search) default from this column; NULL → locale
-- fallback in the app. Canonical length storage stays feet
-- (profiles.default_rig_length / sites.max_rig_length).
--
-- Also extends the authenticated UPDATE allow-list so PostgREST can PATCH the
-- new column (defense in depth with profiles_update_own RLS).
-- The DO $$ grant block below is the one-shot apply for this column.
-- Canonical helper for later columns:
--   private.grant_profiles_authenticated_update_allowlist(text[])
--   (see 20261116140211_profiles_update_allowlist_helper.sql).
-- Do not edit already-applied 20261031035111 for new editable cols.

BEGIN;

-- ---------------------------------------------------------------------------
-- Column + CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_rig_unit text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_rig_unit_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_rig_unit_chk
  CHECK (
    preferred_rig_unit IS NULL
    OR preferred_rig_unit IN ('ft', 'm')
  );

COMMENT ON COLUMN public.profiles.preferred_rig_unit IS
  'Guest preferred rig-length display unit: ft | m | NULL (unset → locale fallback in app). Does not change canonical feet storage.';

COMMENT ON CONSTRAINT profiles_preferred_rig_unit_chk ON public.profiles IS
  'Guest-editable preferred_rig_unit: NULL or ft|m.';

-- ---------------------------------------------------------------------------
-- Authenticated UPDATE grant: allow-list ∩ live (include preferred_rig_unit)
-- REVOKE column UPDATE first so a prior broader grant cannot linger, then
-- GRANT the classified intersection (same fail-closed pattern as
-- 20261031035111_profiles_user_roles_rls.sql).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  known_server_cols text[] := ARRAY[
    'id',
    'role_id',
    'email',
    'created_at',
    'updated_at'
  ];
  expected_editable text[] := ARRAY[
    'full_name',
    'default_rig_length',
    'preferred_rig_unit',
    'preferred_site_type_id',
    'notification_preferences',
    'bookmarked_campgrounds'
  ];
  live_cols text[];
  grant_cols text[];
  missing_expected text[];
  unexpected_live text[];
  grant_list text;
  col text;
BEGIN
  SELECT coalesce(array_agg(c.column_name::text ORDER BY c.column_name), ARRAY[]::text[])
  INTO live_cols
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles';

  RAISE NOTICE 'profiles live columns: %', array_to_string(live_cols, ', ');

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO grant_cols
  FROM unnest(expected_editable) AS c
  WHERE c = ANY (live_cols);

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO missing_expected
  FROM unnest(expected_editable) AS c
  WHERE NOT (c = ANY (live_cols));

  IF coalesce(array_length(missing_expected, 1), 0) > 0 THEN
    RAISE NOTICE
      'Expected editable profiles columns missing on live (skipped): %',
      array_to_string(missing_expected, ', ');
  END IF;

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO unexpected_live
  FROM unnest(live_cols) AS c
  WHERE NOT (c = ANY (known_server_cols) OR c = ANY (expected_editable));

  IF coalesce(array_length(unexpected_live, 1), 0) > 0 THEN
    RAISE EXCEPTION
      'Unexpected profiles columns (add to expected_editable allow-list or known_server_cols before GRANT): %',
      array_to_string(unexpected_live, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(array_length(grant_cols, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'No profiles columns in expected_editable ∩ live; live cols were: %',
      array_to_string(live_cols, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  -- Clear prior column UPDATE privileges for authenticated before re-grant.
  FOREACH col IN ARRAY live_cols
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.profiles FROM authenticated',
      col
    );
  END LOOP;

  SELECT string_agg(format('%I', c), ', ' ORDER BY c)
  INTO grant_list
  FROM unnest(grant_cols) AS c;

  RAISE NOTICE 'Final GRANT UPDATE (%) ON public.profiles TO authenticated', grant_list;
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated',
    grant_list
  );
END $$;

COMMIT;
