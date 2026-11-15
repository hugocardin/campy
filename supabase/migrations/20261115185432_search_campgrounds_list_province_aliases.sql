-- Non-geo guest list filter with province_aliases text[] (same lower(btrim) rules as near-me).
-- Avoids PostgREST .in() serialization of raw DB province spellings.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_campgrounds(
  q text DEFAULT NULL,
  province_aliases text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  address text,
  city text,
  province text,
  country text,
  website text,
  phone text,
  latitude double precision,
  longitude double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(search_campgrounds.q, '')), 100),
              '\',
              '\\'
            ),
            '%',
            '\%'
          ),
          '_',
          '\_'
        ),
        ''
      ) AS q_pat,
      CASE
        WHEN search_campgrounds.province_aliases IS NULL THEN NULL
        WHEN cardinality(search_campgrounds.province_aliases) = 0 THEN ARRAY[]::text[]
        WHEN cardinality(search_campgrounds.province_aliases) > 32 THEN ARRAY[]::text[]
        ELSE coalesce(
          (
            SELECT array_agg(lower(btrim(a)))
            FROM unnest(search_campgrounds.province_aliases) AS a
            WHERE btrim(a) <> ''
              AND char_length(btrim(a)) <= 100
          ),
          ARRAY[]::text[]
        )
      END AS province_aliases_norm
  )
  SELECT
    c.id,
    c.name,
    c.description,
    c.address,
    c.city,
    c.province,
    c.country,
    c.website,
    c.phone,
    CASE
      WHEN c.location IS NULL THEN NULL
      ELSE public.st_y(c.location::public.geometry)
    END AS latitude,
    CASE
      WHEN c.location IS NULL THEN NULL
      ELSE public.st_x(c.location::public.geometry)
    END AS longitude
  FROM public.campgrounds AS c
  CROSS JOIN params AS p
  WHERE c.active = true
    AND (
      p.q_pat IS NULL
      OR c.name ILIKE '%' || p.q_pat || '%' ESCAPE '\'
      OR c.city ILIKE '%' || p.q_pat || '%' ESCAPE '\'
      OR c.province ILIKE '%' || p.q_pat || '%' ESCAPE '\'
    )
    AND (
      p.province_aliases_norm IS NULL
      OR lower(btrim(c.province)) = ANY (p.province_aliases_norm)
    )
  ORDER BY c.name ASC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.search_campgrounds(text, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_campgrounds(text, text[]) TO anon, authenticated;

COMMENT ON FUNCTION public.search_campgrounds(text, text[]) IS
  'Guest non-geo search: q ILIKE + province_aliases via lower(btrim) equality (max 32×100, fail closed); LIMIT 500; SECURITY INVOKER.';

COMMIT;
