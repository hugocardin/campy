-- Issue #24 review: make campground_text_matches inlineable so GIN trigram
-- indexes can match ILIKE predicates; rank suggest by word_similarity.
-- Drop SET search_path (fully qualify names) — same pattern as
-- campground_has_matching_site. Typo path keeps word_similarity() >= 0.45
-- (operator + SET LOCAL threshold parked with scale follow-ups).
-- Applied live as version 20261116041955.

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
-- No SET search_path: fully-qualified names; omitting SET lets the planner inline.
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
  'Guest text match (inlineable): unaccent ILIKE; word_similarity ≥ 0.45 when raw length ≥ 4 (#24).';

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
    extensions.word_similarity(
      public.immutable_unaccent(p.q_raw),
      public.immutable_unaccent(c.name)
    ) DESC,
    c.name ASC
  LIMIT (SELECT lim FROM params);
$$;

COMMENT ON FUNCTION public.suggest_campgrounds(text, integer) IS
  'Guest autocomplete: active campgrounds by unaccent/word_similarity; LIMIT 1–20 (#24).';
