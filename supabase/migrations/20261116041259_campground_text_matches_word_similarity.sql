-- Issue #24: use word_similarity for typo tolerance so short typos match
-- long names (e.g. emerld → Emerald Lake Campground). Default % threshold
-- diluted similarity across the whole name (~0.19 < 0.3).
-- Applied live as version 20261116041259.

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
        extensions.word_similarity(
          public.immutable_unaccent(p_q_raw),
          public.immutable_unaccent(p_name)
        ) >= 0.45
        OR extensions.word_similarity(
          public.immutable_unaccent(p_q_raw),
          public.immutable_unaccent(coalesce(p_city, ''))
        ) >= 0.45
      )
    );
$$;

COMMENT ON FUNCTION public.campground_text_matches(text, text, text, text, text) IS
  'Guest text match: unaccent ILIKE; word_similarity ≥ 0.45 when raw length ≥ 4 (#24).';
