-- Issue #32: document canonical unit for sites.max_rig_length (feet).
-- Guest/admin UIs may accept metres and convert at the edge; storage stays feet.

COMMENT ON COLUMN public.sites.max_rig_length IS
  'Maximum rig length in feet (canonical). Guest search min_rig_length and URL rigLength use the same unit. Metres are display-only (rigUnit=m); convert at the app edge.';
