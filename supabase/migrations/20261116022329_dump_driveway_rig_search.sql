-- Issue #27: dump station (campground amenity), driveway type (site column),
-- rig-length + stay-kind guest search filters (same-site with hookups).
-- Expand/contract: replace require_amps search signatures; keep boolean
-- require_electricity compat wrappers (no DEFAULTs — see #30).

-- ---------------------------------------------------------------------------
-- DUMP_STATION amenity (campground-level; not site sewer)
-- ---------------------------------------------------------------------------
INSERT INTO public.amenities (code, category_id)
SELECT 'DUMP_STATION', ac.id
FROM public.amenity_categories AS ac
WHERE ac.code = 'FACILITIES'
ON CONFLICT (code) DO NOTHING;

-- Protect search-backed amenity codes (WATER/SEWER + DUMP_STATION).
CREATE OR REPLACE FUNCTION public.protect_hookup_amenity_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  protected_codes text[] := ARRAY['WATER', 'SEWER', 'DUMP_STATION'];
  old_code text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF upper(btrim(OLD.code)) = ANY (protected_codes) THEN
      RAISE EXCEPTION 'protected amenity code cannot be deleted: %', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_code := upper(btrim(OLD.code));
    IF old_code = ANY (protected_codes)
       AND upper(btrim(NEW.code)) IS DISTINCT FROM old_code THEN
      RAISE EXCEPTION 'protected amenity code cannot be renamed: %', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_hookup_amenity_codes() IS
  'Blocks delete/rename of WATER, SEWER, DUMP_STATION (guest search-backed codes).';

-- ---------------------------------------------------------------------------
-- sites.driveway_type
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS driveway_type text;

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_driveway_type_valid;

ALTER TABLE public.sites
  ADD CONSTRAINT sites_driveway_type_valid
  CHECK (
    driveway_type IS NULL
    OR driveway_type IN ('PULL_THROUGH', 'BACK_IN')
  );

COMMENT ON COLUMN public.sites.driveway_type IS
  'Site driveway: PULL_THROUGH | BACK_IN | NULL (unknown). Guest search same-site filter.';

-- NOTE: Edited after live apply for fresh `db reset` consistency. Live never
-- re-runs this file; deltas that changed post-apply live in
-- 20261116023948 / 20261116024448 harden migrations.
-- ---------------------------------------------------------------------------
-- max_rig_length by site type (issue #27)
-- LODGING → must be null; RV / RV_AND_TENT → required (> 0); TENT optional.
--
-- Intentional one-way cleanup: lodging sites must not carry a rig length
-- (demo had Gold Creek A1 = 29). Real catalogs with lodging max_rig values
-- lose those values here — preferred over leaving invalid rows.
-- ---------------------------------------------------------------------------
UPDATE public.sites AS s
SET max_rig_length = NULL,
    updated_at = now()
FROM public.site_types AS st
WHERE s.site_type_id = st.id
  AND st.code = 'LODGING'
  AND s.max_rig_length IS NOT NULL;

-- Fail loudly before VALIDATE if any RV/RV_AND_TENT row still lacks max_rig.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(s.id::text || ' (' || s.name || ')', ', ' ORDER BY s.name)
  INTO bad
  FROM public.sites AS s
  JOIN public.site_types AS st ON st.id = s.site_type_id
  WHERE st.code IN ('RV', 'RV_AND_TENT')
    AND (s.max_rig_length IS NULL OR s.max_rig_length <= 0);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'sites_max_rig_length_by_type: RV/RV_AND_TENT sites need max_rig_length > 0 before VALIDATE: %',
      bad;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_max_rig_length_valid(
  p_site_type_id integer,
  p_max_rig_length numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT CASE
        WHEN st.code = 'LODGING' THEN p_max_rig_length IS NULL
        WHEN st.code IN ('RV', 'RV_AND_TENT') THEN
          p_max_rig_length IS NOT NULL
          AND p_max_rig_length > 0
        ELSE true -- TENT and any future types: optional
      END
      FROM public.site_types AS st
      WHERE st.id = p_site_type_id
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.site_max_rig_length_valid(integer, numeric) IS
  'LODGING → null max_rig_length; RV/RV_AND_TENT → required > 0; TENT optional.';

-- Not granted to anon/authenticated (constraint/trigger only; avoid /rpc exposure).
REVOKE ALL ON FUNCTION public.site_max_rig_length_valid(integer, numeric) FROM PUBLIC;

-- CHECK that reads site_types is unsupported long-term (restore/restore issues).
-- Kept briefly for the initial apply; 20261116023948 replaces with a trigger.
ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_max_rig_length_by_type;

ALTER TABLE public.sites
  ADD CONSTRAINT sites_max_rig_length_by_type
  CHECK (public.site_max_rig_length_valid(site_type_id, max_rig_length))
  NOT VALID;

ALTER TABLE public.sites
  VALIDATE CONSTRAINT sites_max_rig_length_by_type;
