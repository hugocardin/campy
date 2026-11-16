/**
 * Guest stay kind: camping (non-lodging sites) vs lodging.
 * Keep in sync with search RPC `stay_kind` param
 * (`supabase/migrations/20261116021437_dump_driveway_rig_search.sql`).
 */
export const STAY_KINDS = ["camping", "lodging"] as const;

export type StayKind = (typeof STAY_KINDS)[number];

const STAY_SET = new Set<string>(STAY_KINDS);

export function parseStayKind(
  value: string | undefined | null,
): StayKind | undefined {
  if (value == null || value.trim() === "") return undefined;
  const key = value.trim().toLowerCase();
  return STAY_SET.has(key) ? (key as StayKind) : undefined;
}

export function formatStayKindParam(
  value: StayKind | undefined | null,
): string | undefined {
  return value ?? undefined;
}

/** Rig-length guest filter is only for camping (or unspecified) searches. */
export function stayKindAllowsRigLength(
  stay: StayKind | undefined | null,
): boolean {
  return stay !== "lodging";
}
