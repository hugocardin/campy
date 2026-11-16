-- Issue #30: drop temporary require_electricity boolean search overloads.
-- App on main uses require_amps only (PR #29). DROP removes comments + grants
-- for these signatures; require_amps overloads are unchanged.

DROP FUNCTION IF EXISTS public.search_campgrounds(
  text, text[], boolean, boolean, boolean
);

DROP FUNCTION IF EXISTS public.search_campgrounds_near(
  double precision, double precision, double precision, text, text[],
  boolean, boolean, boolean
);
