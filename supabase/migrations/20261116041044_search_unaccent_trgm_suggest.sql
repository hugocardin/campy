-- Issue #24: accent-insensitive + trigram text match for guest search,
-- plus suggest_campgrounds for place/campground autocomplete.
-- Applied live as version 20261116041044.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- IMMUTABLE wrapper so expression indexes can use unaccent (extensions.unaccent is STABLE).
CREATE OR REPLACE FUNCTION public.immutable_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $$
  SELECT extensions.unaccent(input);
$$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
  'IMMUTABLE unaccent for indexes + guest search (#24). Uses extensions.unaccent.';

REVOKE ALL ON FUNCTION public.immutable_unaccent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO anon, authenticated;

-- Shared name/city/province match: unaccent ILIKE + optional trigram for typos.
CREATE OR REPLACE FUNCTION public.campground_text_matches(
  p_name text,
  p_city text,
  p_province text,
  p_q_pat text,
  p_q_raw text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_q_pat IS NULL
    OR public.immutable_unaccent(p_name)
         ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    OR public.immutable_unaccent(coalesce(p_city, ''))
         ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    OR public.immutable_unaccent(coalesce(p_province, ''))
         ILIKE '%' || public.immutable_unaccent(p_q_pat) || '%' ESCAPE '\'
    OR (
      p_q_raw IS NOT NULL
      AND char_length(p_q_raw) >= 4
      AND (
        public.immutable_unaccent(p_name)
          OPERATOR(extensions.%) public.immutable_unaccent(p_q_raw)
        OR public.immutable_unaccent(coalesce(p_city, ''))
          OPERATOR(extensions.%) public.immutable_unaccent(p_q_raw)
      )
    );
$$;

COMMENT ON FUNCTION public.campground_text_matches(text, text, text, text, text) IS
  'Guest text match: unaccent ILIKE on name/city/province; trigram % when raw length ≥ 4 (#24).';

REVOKE ALL ON FUNCTION public.campground_text_matches(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campground_text_matches(text, text, text, text, text)
  TO anon, authenticated;

CREATE INDEX IF NOT EXISTS campgrounds_name_unaccent_trgm_idx
  ON public.campgrounds
  USING gin (public.immutable_unaccent(name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS campgrounds_city_unaccent_trgm_idx
  ON public.campgrounds
  USING gin (public.immutable_unaccent(city) extensions.gin_trgm_ops)
  WHERE city IS NOT NULL;

-- Autocomplete: active parks by forgiving name/city match (cap 20).
CREATE OR REPLACE FUNCTION public.suggest_campgrounds(
  q text,
  result_limit integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  province text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      nullif(left(btrim(coalesce(suggest_campgrounds.q, '')), 100), '') AS q_raw,
      nullif(
        replace(
          replace(
            replace(
              left(btrim(coalesce(suggest_campgrounds.q, '')), 100),
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
      least(greatest(coalesce(suggest_campgrounds.result_limit, 8), 1), 20) AS lim
  )
  SELECT
    c.id,
    c.name,
    c.city,
    c.province
  FROM public.campgrounds AS c
  CROSS JOIN params AS p
  WHERE c.active = true
    AND p.q_pat IS NOT NULL
    AND char_length(p.q_raw) >= 3
    AND public.campground_text_matches(c.name, c.city, c.province, p.q_pat, p.q_raw)
  ORDER BY
    extensions.similarity(
      public.immutable_unaccent(c.name),
      public.immutable_unaccent(p.q_raw)
    ) DESC,
    c.name ASC
  LIMIT (SELECT lim FROM params);
$$;

COMMENT ON FUNCTION public.suggest_campgrounds(text, integer) IS
  'Guest autocomplete: active campgrounds by unaccent/trigram name+city; LIMIT 1–20 (#24).';

REVOKE ALL ON FUNCTION public.suggest_campgrounds(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_campgrounds(text, integer) TO anon, authenticated;
