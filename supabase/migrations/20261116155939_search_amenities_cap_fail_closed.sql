-- PR #47: oversized amenity filter fails closed (NULL), not off ({}).
-- Cap applies after DISTINCT + exclusion, matching TS normalizeGuestAmenityCodes.

CREATE OR REPLACE FUNCTION public.normalize_guest_amenity_ids(
  require_amenity_codes text[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN require_amenity_codes IS NULL THEN ARRAY[]::uuid[]
    WHEN cardinality(require_amenity_codes) = 0 THEN ARRAY[]::uuid[]
    -- Cheap DoS guard on raw input — fail closed, not "filter off".
    WHEN cardinality(require_amenity_codes) > 64 THEN NULL
    ELSE (
      WITH keys AS (
        SELECT DISTINCT public.amenity_code_canonical_key(c) AS k
        FROM unnest(require_amenity_codes) AS c
        WHERE public.amenity_code_canonical_key(c) IS NOT NULL
          AND char_length(public.amenity_code_canonical_key(c)) <= 64
          AND public.amenity_code_canonical_key(c) NOT IN (
            'WATER', 'SEWER', 'DUMP_STATION', 'ELECTRICITY'
          )
      ),
      resolved AS (
        SELECT
          k.k,
          (
            SELECT am.id
            FROM public.amenities AS am
            WHERE public.amenity_code_canonical_key(am.code) = k.k
            LIMIT 1
          ) AS amenity_id
        FROM keys AS k
      )
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM keys) THEN ARRAY[]::uuid[]
        -- Cap after DISTINCT/exclusion (aligned with GUEST_AMENITY_CODES_MAX).
        WHEN (SELECT count(*)::int FROM keys) > 16 THEN NULL
        WHEN EXISTS (SELECT 1 FROM resolved WHERE amenity_id IS NULL) THEN NULL
        ELSE (
          SELECT array_agg(amenity_id ORDER BY k)
          FROM resolved
        )
      END
    )
  END;
$$;

COMMENT ON FUNCTION public.normalize_guest_amenity_ids(text[]) IS
  'Guest park amenity ids (#24/#47). NULL = unknown/oversized (fail closed); {} = off; else AND.';
