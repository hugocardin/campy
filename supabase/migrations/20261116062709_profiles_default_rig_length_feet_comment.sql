-- Phase B: document canonical unit for profiles.default_rig_length (feet).
-- Guest profile UI may accept metres and convert at the edge; storage stays feet
-- (same convention as sites.max_rig_length / guest search rigLength).

COMMENT ON COLUMN public.profiles.default_rig_length IS
  'Default guest rig length in feet (canonical). Profile edit and future default search criteria use the same unit. Metres are display-only; convert at the app edge.';
