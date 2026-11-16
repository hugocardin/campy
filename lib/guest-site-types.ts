/**
 * Guest search fine site-type filters (issue #24).
 * Codes match `site_types.code` / {@link SITE_TYPE_CODES}.
 * Coarse `stay` (camping/lodging) remains; fine types AND with it when both set.
 */
import {
  SITE_TYPE_CODES,
  type SiteTypeCode,
  isLodgingSiteType,
} from "@/lib/site-rig-length";
import type { StayKind } from "@/lib/stay-kind";
import { stayKindAllowsRigLength } from "@/lib/stay-kind";

export type GuestSiteTypeCode = SiteTypeCode;

/** All seeded site types available as guest multi-select filters. */
export const GUEST_SITE_TYPE_CODES = SITE_TYPE_CODES;

const GUEST_SITE_TYPE_SET = new Set<string>(GUEST_SITE_TYPE_CODES);

/** Camping-only fine types (hidden / cleared when stay=lodging). */
export const GUEST_CAMPING_SITE_TYPE_CODES = [
  "TENT",
  "RV",
  "RV_AND_TENT",
] as const satisfies readonly GuestSiteTypeCode[];

const CAMPING_TYPE_SET = new Set<string>(GUEST_CAMPING_SITE_TYPE_CODES);

export function isGuestSiteTypeCode(
  value: string | undefined | null,
): value is GuestSiteTypeCode {
  if (value == null) return false;
  return GUEST_SITE_TYPE_SET.has(value.trim().toUpperCase());
}

export function normalizeGuestSiteTypes(
  types: readonly GuestSiteTypeCode[] | undefined | null,
): GuestSiteTypeCode[] {
  if (types == null || types.length === 0) return [];
  const selected = new Set(
    types
      .map((c) => String(c).trim().toUpperCase())
      .filter((c): c is GuestSiteTypeCode => GUEST_SITE_TYPE_SET.has(c)),
  );
  return GUEST_SITE_TYPE_CODES.filter((c) => selected.has(c));
}

/**
 * Parse `types` URL param: comma-separated codes (case-insensitive).
 * Dedupes and stable-orders by {@link GUEST_SITE_TYPE_CODES}.
 */
export function parseGuestSiteTypes(
  value: string | undefined | null,
): GuestSiteTypeCode[] {
  if (value == null || value.trim() === "") return [];
  const parts = value.split(",").map((part) => part.trim().toUpperCase());
  return normalizeGuestSiteTypes(
    parts.filter((c): c is GuestSiteTypeCode => GUEST_SITE_TYPE_SET.has(c)),
  );
}

/** Serialize for URL (`tent,rv`). Empty → omit. */
export function formatGuestSiteTypesParam(
  types: readonly GuestSiteTypeCode[] | undefined | null,
): string | undefined {
  const normalized = normalizeGuestSiteTypes(types);
  if (normalized.length === 0) return undefined;
  return normalized.map((c) => c.toLowerCase()).join(",");
}

/**
 * Drop types incompatible with coarse stay:
 * - lodging → only LODGING
 * - camping → drop LODGING
 */
export function siteTypesForStayKind(
  types: readonly GuestSiteTypeCode[] | undefined | null,
  stayKind: StayKind | undefined | null,
): GuestSiteTypeCode[] {
  const normalized = normalizeGuestSiteTypes(types);
  if (stayKind === "lodging") {
    return normalized.filter((c) => isLodgingSiteType(c));
  }
  if (stayKind === "camping") {
    return normalized.filter((c) => CAMPING_TYPE_SET.has(c));
  }
  return normalized;
}

/** Fine camping types are only meaningful when stay allows camping attrs. */
export function stayKindAllowsCampingSiteTypes(
  stay: StayKind | undefined | null,
): boolean {
  return stayKindAllowsRigLength(stay);
}
