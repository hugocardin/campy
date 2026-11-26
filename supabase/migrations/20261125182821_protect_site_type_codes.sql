-- Protect seeded site_types codes (TENT / RV / RV_AND_TENT / LODGING) from
-- rename/delete, mirroring protect_hookup_amenity_codes. Also add a format +
-- length CHECK so app-side normalizeSiteTypeCode is not the only guard.

ALTER TABLE public.site_types
  DROP CONSTRAINT IF EXISTS site_types_code_format;

ALTER TABLE public.site_types
  ADD CONSTRAINT site_types_code_format
  CHECK (
    char_length(btrim(code)) > 0
    AND char_length(code) <= 64
    AND code ~ '^[A-Z][A-Z0-9_]*$'
  );

CREATE OR REPLACE FUNCTION public.protect_seeded_site_type_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.code IN ('TENT', 'RV', 'RV_AND_TENT', 'LODGING') THEN
      RAISE EXCEPTION 'seeded site type code % is protected', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.code IN ('TENT', 'RV', 'RV_AND_TENT', 'LODGING')
       AND NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'seeded site type code % cannot be renamed', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.code IN ('TENT', 'RV', 'RV_AND_TENT', 'LODGING')
       AND OLD.code IS DISTINCT FROM NEW.code THEN
      RAISE EXCEPTION 'cannot rename site type to protected code %', NEW.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_seeded_site_type_codes ON public.site_types;

CREATE TRIGGER protect_seeded_site_type_codes
  BEFORE UPDATE OR DELETE ON public.site_types
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_seeded_site_type_codes();

COMMENT ON FUNCTION public.protect_seeded_site_type_codes() IS
  'Refuse rename/delete of TENT/RV/RV_AND_TENT/LODGING (SQL + guest search coupling).';

COMMENT ON CONSTRAINT site_types_code_format ON public.site_types IS
  'Lookup codes: 1–64 chars, /^[A-Z][A-Z0-9_]*$/ after app uppercase normalize.';
