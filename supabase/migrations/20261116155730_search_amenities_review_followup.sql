-- PR #47 follow-up review: unique canonical keys, drop unused fail-open helper.

-- Prefer one amenity row per canonical key (PET FRIENDLY vs PET_FRIENDLY).
CREATE UNIQUE INDEX IF NOT EXISTS amenities_code_canonical_key_uidx
  ON public.amenities (public.amenity_code_canonical_key(code));

COMMENT ON INDEX public.amenities_code_canonical_key_uidx IS
  'Guest search (#24/#47): one catalog row per canonical amenity key.';

-- Resolve guest amenity filter to amenity ids (any id per key after unique index).
-- NULL  = fail closed (unknown / stale code in input)
-- {}    = no amenity filter
-- {ids} = park must have every id (AND)
-- Must stay in sync with lib/guest-amenity-codes.ts
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
    WHEN cardinality(require_amenity_codes) > 16 THEN ARRAY[]::uuid[]
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
        WHEN EXISTS (SELECT 1 FROM resolved WHERE amenity_id IS NULL) THEN NULL
        ELSE (
          SELECT array_agg(amenity_id ORDER BY k)
          FROM resolved
        )
      END
    )
  END;
$$;

-- Old key-normalizer had fail-open semantics and is unused by search RPCs.
DROP FUNCTION IF EXISTS public.normalize_guest_amenity_codes(text[]);
