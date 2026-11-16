-- Phase B review (#41): tighten profiles_full_name_len_chk so PostgREST PATCH
-- cannot store space-padded megabyte names, control-only names, or untrimmed
-- values. Keep 120 in sync with FULL_NAME_MAX_LENGTH (lib/profile-validation.ts).

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_full_name_len_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_full_name_len_chk
  CHECK (
    full_name IS NULL
    OR (
      -- Stored value must already be trimmed (ASCII space via btrim).
      full_name = btrim(full_name)
      AND char_length(full_name) BETWEEN 1 AND 120
      -- No control characters (tabs/newlines/etc.).
      AND full_name !~ '[[:cntrl:]]'
      -- At least one character that is not whitespace / common invisibles
      -- (ZWSP, BOM, bidi overrides). ZWJ/ZWNJ alone still fail this class.
      AND full_name ~ U&'[^[:space:]\200B-\200F\202A-\202E\2060\FEFF]'
    )
  );

COMMENT ON CONSTRAINT profiles_full_name_len_chk ON public.profiles IS
  'Guest-editable full_name: NULL, or trimmed 1–120 chars with no controls and at least one visible non-space (matches FULL_NAME_MAX_LENGTH / normalizePersonName intent).';
