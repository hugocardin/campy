-- Canonical profiles UPDATE allow-list helper (#42 step 2 review).
-- Future editable columns: add a *new* forward migration that calls
--   private.grant_profiles_authenticated_update_allowlist(ARRAY[...full list...])
-- Do not edit this already-applied migration's array (or copy the old DO $$
-- grant blocks from 20261031035111 / 20261116135025).
--
-- Idempotent: safe to re-run. Creates `private` schema if missing.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

COMMENT ON SCHEMA private IS
  'Internal Campy helpers not exposed via PostgREST (no API grants).';

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

CREATE OR REPLACE FUNCTION private.grant_profiles_authenticated_update_allowlist(
  p_expected_editable text[]
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  known_server_cols text[] := ARRAY[
    'id',
    'role_id',
    'email',
    'created_at',
    'updated_at'
  ];
  live_cols text[];
  grant_cols text[];
  missing_expected text[];
  unexpected_live text[];
  grant_list text;
  col text;
BEGIN
  IF p_expected_editable IS NULL
     OR coalesce(array_length(p_expected_editable, 1), 0) = 0 THEN
    RAISE EXCEPTION
      'grant_profiles_authenticated_update_allowlist: expected_editable must be non-empty'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(c.column_name::text ORDER BY c.column_name), ARRAY[]::text[])
  INTO live_cols
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles';

  RAISE NOTICE 'profiles live columns: %', array_to_string(live_cols, ', ');

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO grant_cols
  FROM unnest(p_expected_editable) AS c
  WHERE c = ANY (live_cols);

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO missing_expected
  FROM unnest(p_expected_editable) AS c
  WHERE NOT (c = ANY (live_cols));

  IF coalesce(array_length(missing_expected, 1), 0) > 0 THEN
    RAISE NOTICE
      'Expected editable profiles columns missing on live (skipped): %',
      array_to_string(missing_expected, ', ');
  END IF;

  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
  INTO unexpected_live
  FROM unnest(live_cols) AS c
  WHERE NOT (c = ANY (known_server_cols) OR c = ANY (p_expected_editable));

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

  RETURN grant_cols;
END;
$$;

REVOKE ALL ON FUNCTION private.grant_profiles_authenticated_update_allowlist(text[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION private.grant_profiles_authenticated_update_allowlist(text[])
  FROM anon;
REVOKE ALL ON FUNCTION private.grant_profiles_authenticated_update_allowlist(text[])
  FROM authenticated;

COMMENT ON FUNCTION private.grant_profiles_authenticated_update_allowlist(text[]) IS
  'Fail-closed: GRANT UPDATE (expected_editable ∩ live) on public.profiles TO authenticated. Unexpected live cols RAISE. Call from forward migrations when adding guest-editable profile columns.';

-- Current allow-list (includes preferred_rig_unit from 20261116135025).
SELECT private.grant_profiles_authenticated_update_allowlist(
  ARRAY[
    'full_name',
    'default_rig_length',
    'preferred_rig_unit',
    'preferred_site_type_id',
    'notification_preferences',
    'bookmarked_campgrounds'
  ]
);

COMMIT;
