/**
 * Canonical Canadian province/territory codes for guest search filters.
 * Admin may still store free-text aliases; filter matching expands to aliases.
 */

export const CANADIAN_PROVINCE_CODES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export type CanadianProvinceCode = (typeof CANADIAN_PROVINCE_CODES)[number];

/** Display / DB aliases per code (code itself included). */
export const CANADIAN_PROVINCE_ALIASES: Record<
  CanadianProvinceCode,
  readonly string[]
> = {
  AB: ["AB", "Alberta", "Alta", "Alta."],
  BC: [
    "BC",
    "British Columbia",
    "Colombie-Britannique",
    "Colombie Britannique",
    "C.-B.",
    "C.B.",
    "CB",
  ],
  MB: ["MB", "Manitoba", "Man", "Man."],
  NB: ["NB", "New Brunswick", "Nouveau-Brunswick", "N.B."],
  NL: [
    "NL",
    "Newfoundland and Labrador",
    "Newfoundland & Labrador",
    "Newfoundland",
    "Terre-Neuve-et-Labrador",
    "Terre-Neuve et Labrador",
    "Terre-Neuve",
    "T.-N.-L.",
    "T.N.L.",
    "NF",
    "NFLD",
  ],
  NS: ["NS", "Nova Scotia", "Nouvelle-Écosse", "Nouvelle Ecosse", "N.S."],
  NT: [
    "NT",
    "Northwest Territories",
    "Territoires du Nord-Ouest",
    "N.W.T.",
    "NWT",
  ],
  NU: ["NU", "Nunavut"],
  ON: ["ON", "Ontario", "Ont", "Ont."],
  PE: [
    "PE",
    "PEI",
    "P.E.I.",
    "Prince Edward Island",
    "Île-du-Prince-Édouard",
    "Ile-du-Prince-Edouard",
    "Île du Prince-Édouard",
  ],
  QC: [
    "QC",
    "Quebec",
    "Québec",
    "Que.",
    "PQ",
    "P.Q.",
    "Province de Québec",
    "Province de Quebec",
  ],
  SK: ["SK", "Saskatchewan", "Sask", "Sask."],
  YT: ["YT", "Yukon", "Yukon Territory", "Territoire du Yukon"],
};

const CODE_SET = new Set<string>(CANADIAN_PROVINCE_CODES);

/** Fold for alias lookup: strip accents/punctuation, lowercase. */
export function foldProvinceKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildFoldedAliasToCode(): Map<string, CanadianProvinceCode> {
  const map = new Map<string, CanadianProvinceCode>();
  for (const code of CANADIAN_PROVINCE_CODES) {
    for (const alias of CANADIAN_PROVINCE_ALIASES[code]) {
      const folded = foldProvinceKey(alias);
      if (!folded) continue;
      const existing = map.get(folded);
      if (existing != null && existing !== code) {
        throw new Error(
          `Folded province alias collision: "${alias}" → "${folded}" maps to both ${existing} and ${code}`,
        );
      }
      map.set(folded, code);
    }
  }
  return map;
}

const FOLDED_ALIAS_TO_CODE: Map<string, CanadianProvinceCode> =
  buildFoldedAliasToCode();

export function isCanadianProvinceCode(
  value: string,
): value is CanadianProvinceCode {
  return CODE_SET.has(value);
}

/**
 * Resolve a URL/query/DB string to a canonical 2-letter code when possible.
 * Returns null when the value is empty or not a known alias.
 */
export function resolveProvinceCode(
  raw: string | null | undefined,
): CanadianProvinceCode | null {
  if (raw == null) return null;
  const trimmed = raw.trim().slice(0, 100);
  if (!trimmed) return null;
  if (isCanadianProvinceCode(trimmed.toUpperCase())) {
    return trimmed.toUpperCase() as CanadianProvinceCode;
  }
  const folded = foldProvinceKey(trimmed);
  return FOLDED_ALIAS_TO_CODE.get(folded) ?? null;
}

/**
 * Stable filter key for the URL: only canonical codes (unknown → null / All).
 */
export function provinceFilterKey(
  raw: string | null | undefined,
): CanadianProvinceCode | null {
  return resolveProvinceCode(raw);
}

/**
 * Controlled alias strings to match against `campgrounds.province` for a code.
 * Unknown / malicious URL values resolve to [] — never pass raw user input.
 *
 * Optionally merges distinct DB raw values whose fold maps to the same code
 * (so odd punctuation in stored rows still matches when filtered).
 */
export function provinceMatchValues(
  filterKey: string,
  rawDbProvinces?: Iterable<string | null | undefined>,
): string[] {
  const code = resolveProvinceCode(filterKey);
  if (!code) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  for (const alias of CANADIAN_PROVINCE_ALIASES[code]) {
    add(alias);
    // `.in()` is case-sensitive; include lowercased forms for free-text DB rows.
    const lower = alias.toLocaleLowerCase("en-CA");
    if (lower !== alias) add(lower);
  }

  if (rawDbProvinces) {
    for (const raw of rawDbProvinces) {
      if (raw == null) continue;
      const trimmed = raw.trim().slice(0, 100);
      if (!trimmed) continue;
      if (resolveProvinceCode(trimmed) === code) {
        add(trimmed);
      }
    }
  }

  return out;
}

/**
 * Build the distinct filter option list from raw DB province strings.
 * Collapses aliases to one code; keeps unknown free-text DB values as-is
 * (URL unknowns are ignored separately via {@link provinceFilterKey}).
 */
export function uniqueProvinceFilterKeys(
  rawProvinces: Iterable<string | null | undefined>,
): string[] {
  const keys = new Set<string>();
  for (const raw of rawProvinces) {
    if (raw == null) continue;
    const trimmed = raw.trim().slice(0, 100);
    if (!trimmed) continue;
    keys.add(resolveProvinceCode(trimmed) ?? trimmed);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "en-CA"));
}

/** Exported for tests — builds the folded map and asserts no collisions. */
export function assertNoFoldedAliasCollisions(): void {
  buildFoldedAliasToCode();
}
