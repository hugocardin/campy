-- Phase B review (#41): DB-level guards for guest-editable profile columns +
-- keep profiles.updated_at fresh on every UPDATE (column is not in the
-- authenticated UPDATE grant, so the app cannot set it).
--
-- Keep limits in sync with:
--   lib/profile-validation.ts → FULL_NAME_MAX_LENGTH (120)
--   lib/site-rig-length.ts → RIG_LENGTH_MAX_FT (200)

-- ---------------------------------------------------------------------------
-- CHECKs (PostgREST PATCH bypass of the server action)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_full_name_len_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_len_chk
  CHECK (
    full_name IS NULL
    OR char_length(btrim(full_name)) BETWEEN 1 AND 120
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_default_rig_length_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_rig_length_chk
  CHECK (
    default_rig_length IS NULL
    OR (
      default_rig_length > 0
      AND default_rig_length <= 200
    )
  );

COMMENT ON CONSTRAINT profiles_full_name_len_chk ON public.profiles IS
  'Guest-editable full_name: NULL or trimmed length 1–120 (matches FULL_NAME_MAX_LENGTH).';

COMMENT ON CONSTRAINT profiles_default_rig_length_chk ON public.profiles IS
  'Guest-editable default_rig_length in feet: NULL or (0, 200] (matches RIG_LENGTH_MAX_FT).';

-- ---------------------------------------------------------------------------
-- updated_at on every UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM authenticated;

COMMENT ON FUNCTION public.profiles_set_updated_at() IS
  'BEFORE UPDATE on profiles: set updated_at = now(). Needed because authenticated cannot UPDATE the updated_at column (server-owned grant allow-list).';

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_updated_at();
