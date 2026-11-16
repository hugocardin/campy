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

-- Fail loudly if a signature drift left a require_electricity overload callable
-- (DROP IF EXISTS with a mismatched identity args is a silent no-op).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('search_campgrounds', 'search_campgrounds_near')
      AND 'require_electricity' = ANY (p.proargnames)
  ) THEN
    RAISE EXCEPTION 'require_electricity search overloads still present';
  END IF;
END $$;
