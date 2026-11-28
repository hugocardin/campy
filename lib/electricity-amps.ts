/**
 * Fixed site electricity amp options (never free text).
 * Guest search "None" is a filter token only — sites store `{}` for no power.
 *
 * 15 is the combined 15/20A low-tier outlet (UI label "15/20 A").
 * Legacy stored/URL value 20 remaps to 15.
 *
 * Keep in sync with SQL `public.electricity_amp_values()`
 * (`supabase/migrations/20261128183815_merge_electricity_amps_15_20.sql`).
 */
export const ELECTRICITY_AMP_VALUES = [15, 30, 50] as const;

export type ElectricityAmp = (typeof ELECTRICITY_AMP_VALUES)[number];

/** Legacy separate 20A value; remapped to the combined 15/20A tier (15). */
export const ELECTRICITY_AMP_LEGACY_20 = 20;

/** Guest filter token for sites with no electricity (`{}`). */
export const ELECTRICITY_AMP_NONE = "none" as const;

export type ElectricityAmpFilterOption =
  | typeof ELECTRICITY_AMP_NONE
  | ElectricityAmp;

/** Sentinel sent to search RPCs for the "None" filter option. */
export const ELECTRICITY_AMP_NONE_RPC = 0;

/** i18n message keys under `sites.electricityAmps.*`. */
export const ELECTRICITY_AMP_MESSAGE_KEYS = {
  15: "amp15",
  30: "amp30",
  50: "amp50",
} as const satisfies Record<ElectricityAmp, string>;

const AMP_SET = new Set<number>(ELECTRICITY_AMP_VALUES);

export function isElectricityAmp(value: number): value is ElectricityAmp {
  return AMP_SET.has(value);
}

/**
 * Parse a single amp. Strings must be plain decimal digits (`/^\d+$/`).
 * Numbers must be integers in the allowed set.
 * Legacy `20` remaps to `15` (combined 15/20A tier).
 */
export function parseElectricityAmp(value: unknown): ElectricityAmp | undefined {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return undefined;
    if (value === ELECTRICITY_AMP_LEGACY_20) return 15;
    if (!isElectricityAmp(value)) return undefined;
    return value;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (n === ELECTRICITY_AMP_LEGACY_20) return 15;
  if (!isElectricityAmp(n)) return undefined;
  return n;
}

/** Dedupe + keep fixed list order. Drops invalid values. */
export function normalizeElectricityAmps(
  values: readonly unknown[],
): ElectricityAmp[] {
  const selected = new Set<ElectricityAmp>();
  for (const value of values) {
    const amp = parseElectricityAmp(value);
    if (amp != null) selected.add(amp);
  }
  return ELECTRICITY_AMP_VALUES.filter((amp) => selected.has(amp));
}

/**
 * Strict parse for admin writes: reject non-arrays and any invalid/duplicate
 * entries (do not silently drop). Empty array = no electricity.
 * Legacy 20 is accepted and stored as 15; [15, 20] is a duplicate → invalid.
 */
export function parseElectricityAmpsInput(
  value: unknown,
):
  | { ok: true; amps: ElectricityAmp[] }
  | { ok: false; reason: "missing" | "invalid" } {
  if (value == null) {
    return { ok: false, reason: "missing" };
  }
  if (!Array.isArray(value)) {
    return { ok: false, reason: "invalid" };
  }
  const parsed: ElectricityAmp[] = [];
  for (const entry of value) {
    const amp = parseElectricityAmp(entry);
    if (amp == null) {
      return { ok: false, reason: "invalid" };
    }
    parsed.push(amp);
  }
  const normalized = normalizeElectricityAmps(parsed);
  // Reject duplicates after legacy 20→15 remap (e.g. [15, 20]).
  if (parsed.length !== normalized.length) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, amps: normalized };
}

/**
 * Guest filter options: none / 15 (15/20A) / 30 / 50.
 * Dedupes, drops junk, remaps legacy 20→15, keeps stable order (none first).
 */
export function normalizeElectricityAmpFilters(
  values: readonly unknown[],
): ElectricityAmpFilterOption[] {
  let wantNone = false;
  const amps: unknown[] = [];
  for (const value of values) {
    if (value === ELECTRICITY_AMP_NONE || value === "0" || value === 0) {
      wantNone = true;
      continue;
    }
    amps.push(value);
  }
  const normalized = normalizeElectricityAmps(amps);
  return wantNone
    ? [ELECTRICITY_AMP_NONE, ...normalized]
    : normalized;
}

/**
 * Join localized outlet labels (already include the unit), e.g. "15/20 A + 30 A".
 * Empty → null. Prefer this over numeric formatting so guests see exact plugs.
 */
export function formatElectricityAmpsWithLabels(
  amps: readonly ElectricityAmp[] | null | undefined,
  labelFor: (amp: ElectricityAmp) => string,
): string | null {
  const normalized = normalizeElectricityAmps(amps ?? []);
  if (normalized.length === 0) return null;
  return normalized.map(labelFor).join(" + ");
}

/**
 * Amp numbers for display without unit (e.g. "15 + 50"). Empty → null.
 * Prefer `formatElectricityAmpsWithLabels` when i18n labels are available.
 */
export function formatElectricityAmps(
  amps: readonly ElectricityAmp[] | null | undefined,
): string | null {
  const normalized = normalizeElectricityAmps(amps ?? []);
  if (normalized.length === 0) return null;
  return normalized.join(" + ");
}

/** Union of amp options across sites (campground-level summary). */
export function unionElectricityAmps(
  siteAmps: readonly (readonly ElectricityAmp[] | null | undefined)[],
): ElectricityAmp[] {
  const selected = new Set<ElectricityAmp>();
  for (const amps of siteAmps) {
    for (const amp of normalizeElectricityAmps(amps ?? [])) {
      selected.add(amp);
    }
  }
  return ELECTRICITY_AMP_VALUES.filter((amp) => selected.has(amp));
}

/**
 * Map filter options to RPC `require_amps` (0 = none).
 * Empty filter → null (no electricity restriction).
 */
export function electricityAmpsToRpcArg(
  filters: readonly ElectricityAmpFilterOption[],
): number[] | null {
  const normalized = normalizeElectricityAmpFilters(filters);
  if (normalized.length === 0) return null;
  return normalized.map((opt) =>
    opt === ELECTRICITY_AMP_NONE ? ELECTRICITY_AMP_NONE_RPC : opt,
  );
}
