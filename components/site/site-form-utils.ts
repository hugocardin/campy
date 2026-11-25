import { Site } from "@/entities/sites";
import type { DrivewayType } from "@/lib/driveway-type";
import type { ElectricityAmp } from "@/lib/electricity-amps";
import { normalizeElectricityAmps } from "@/lib/electricity-amps";
import {
  formatPricingRulesForEditor,
  parsePricingRulesInput,
  type ParsePricingRulesResult,
  type PricingRulesObject,
} from "@/lib/site-pricing-rules";

export type SiteFormData = {
  id?: string;
  name: string;
  description: string;
  site_type_id: string;
  max_rig_length: string;
  price_per_night: string;
  min_stay_nights: string;
  electricity_amps: ElectricityAmp[];
  driveway_type: DrivewayType | "";
  /** Pretty-printed JSON object text for the pricing_rules editor. */
  pricing_rules: string;
  /** Loaded column had a non-object shape (pre-CHECK legacy). */
  pricing_rules_unexpected?: boolean;
};

export type ResolvePricingRulesFormStateInput = {
  isEdit: boolean;
  text: string;
  initialText: string;
  unexpected?: boolean;
};

export type ResolvePricingRulesFormStateResult = {
  dirty: boolean;
  /** True when create/dirty edit has invalid JSON — blocks Save. */
  blocking: boolean;
  /**
   * Edit with unchanged out-of-bounds stored text: do not block Save, but
   * surface a non-blocking amber warning.
   */
  storedOutOfBounds: boolean;
  /** Omit (`undefined`) when edit && !dirty; otherwise the parsed object. */
  payload: PricingRulesObject | undefined;
  parsed: ParsePricingRulesResult;
};

/**
 * Pure dirty / blocking / omit / warning rules for the pricing_rules editor.
 * Callers must abort submit when `blocking` is true before reading `payload`.
 */
export function resolvePricingRulesFormState(
  input: ResolvePricingRulesFormStateInput,
): ResolvePricingRulesFormStateResult {
  const parsed = parsePricingRulesInput(input.text);
  const dirty =
    input.text !== input.initialText || Boolean(input.unexpected);
  const blocking = (!input.isEdit || dirty) && !parsed.ok;
  const storedOutOfBounds = input.isEdit && !dirty && !parsed.ok;

  if (blocking) {
    return {
      dirty,
      blocking: true,
      storedOutOfBounds: false,
      payload: undefined,
      parsed,
    };
  }

  // Unchanged edit: omit column (keeps stored value, even if out of bounds).
  if (input.isEdit && !dirty) {
    return {
      dirty: false,
      blocking: false,
      storedOutOfBounds,
      payload: undefined,
      parsed,
    };
  }

  // Create or dirty edit and not blocking ⇒ parse succeeded.
  if (!parsed.ok) {
    throw new Error(
      "resolvePricingRulesFormState: expected valid parse when not blocking",
    );
  }

  return {
    dirty,
    blocking: false,
    storedOutOfBounds: false,
    payload: parsed.data,
    parsed,
  };
}

/**
 * Converts a Site entity (or null for create) into the shape expected by SiteFormClient's initialData prop.
 */
export function toSiteFormData(site: Site): SiteFormData | undefined {
  if (!site) {
    return undefined;
  }

  return {
    id: site.id,
    name: site.name ?? "",
    description: site.description ?? "",
    site_type_id: String(site.site_type_id),
    max_rig_length: String(site.max_rig_length ?? ""),
    price_per_night: String(site.price_per_night ?? ""),
    min_stay_nights: String(site.min_stay_nights ?? ""),
    electricity_amps: normalizeElectricityAmps(site.electricity_amps ?? []),
    driveway_type: site.driveway_type ?? "",
    pricing_rules: site.pricing_rules_unexpected
      ? "{}"
      : formatPricingRulesForEditor(site.pricing_rules),
    pricing_rules_unexpected: site.pricing_rules_unexpected === true,
  };
}
