/**
 * Site driveway type (pull-through vs back-in).
 * Keep in sync with SQL CHECK on `sites.driveway_type`
 * (`supabase/migrations/20261116021437_dump_driveway_rig_search.sql`).
 */
export const DRIVEWAY_TYPES = ["PULL_THROUGH", "BACK_IN"] as const;

export type DrivewayType = (typeof DRIVEWAY_TYPES)[number];

/** Guest URL tokens (lowercase). */
export const DRIVEWAY_URL_VALUES = {
  pull_through: "PULL_THROUGH",
  back_in: "BACK_IN",
} as const satisfies Record<string, DrivewayType>;

export type DrivewayUrlValue = keyof typeof DRIVEWAY_URL_VALUES;

const TYPE_SET = new Set<string>(DRIVEWAY_TYPES);

export function isDrivewayType(value: string): value is DrivewayType {
  return TYPE_SET.has(value);
}

/** Parse admin / DB value; reject junk. */
export function parseDrivewayType(
  value: unknown,
): DrivewayType | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  if (isDrivewayType(upper)) return upper;
  return undefined;
}

/** Strict admin write: missing/empty → null; invalid → error. */
export function parseDrivewayTypeInput(
  value: unknown,
):
  | { ok: true; drivewayType: DrivewayType | null }
  | { ok: false; reason: "invalid" } {
  if (value == null || value === "") {
    return { ok: true, drivewayType: null };
  }
  const parsed = parseDrivewayType(value);
  if (parsed === undefined) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, drivewayType: parsed };
}

/** Guest URL `driveway=pull_through|back_in`. */
export function parseDrivewayUrlParam(
  value: string | undefined,
): DrivewayType | undefined {
  if (value == null || value.trim() === "") return undefined;
  const key = value.trim().toLowerCase() as DrivewayUrlValue;
  return DRIVEWAY_URL_VALUES[key];
}

export function formatDrivewayUrlParam(
  value: DrivewayType | undefined | null,
): string | undefined {
  if (value == null) return undefined;
  if (value === "PULL_THROUGH") return "pull_through";
  if (value === "BACK_IN") return "back_in";
  return undefined;
}
