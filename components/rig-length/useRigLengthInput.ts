"use client";

import { useState } from "react";
import {
  convertRigDraftOnUnitChange,
  formatRigLengthForDisplay,
  maxRigLengthInUnit,
  parseRigLengthToFeet,
  type ParseRigLengthResult,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { useLocale, useTranslations } from "next-intl";

export function defaultRigUnitForLocale(locale: string): RigLengthUnit {
  return locale.toLowerCase().startsWith("fr") ? "m" : "ft";
}

type Options = {
  /** Canonical feet already stored; null/undefined → empty draft (uncontrolled). */
  initialFeet?: number | null;
  /**
   * Starting display unit. When omitted, defaults from locale (`fr*` → m).
   * Site admin passes `"ft"` to keep feet-first editing.
   */
  initialUnit?: RigLengthUnit;
  /**
   * Controlled draft (e.g. `form.max_rig_length` on site admin). When set with
   * `onDraftChange`, the hook does not own draft state.
   */
  draft?: string;
  onDraftChange?: (draft: string) => void;
};

/**
 * Shared draft + unit state for profile / site / search rig-length inputs
 * (issue #42). Canonical parse stays in feet via {@link parseRigLengthToFeet}.
 */
export function useRigLengthInput({
  initialFeet,
  initialUnit,
  draft: controlledDraft,
  onDraftChange,
}: Options = {}) {
  const locale = useLocale();
  const tUnits = useTranslations("common.units");
  const startingUnit = initialUnit ?? defaultRigUnitForLocale(locale);
  const isControlled =
    controlledDraft !== undefined && typeof onDraftChange === "function";

  const [unit, setUnit] = useState<RigLengthUnit>(startingUnit);
  const [internalDraft, setInternalDraft] = useState(() =>
    isControlled
      ? ""
      : formatRigLengthForDisplay(initialFeet, startingUnit, locale),
  );

  const draft = isControlled ? controlledDraft : internalDraft;
  const setDraft = isControlled ? onDraftChange : setInternalDraft;

  const unitLabel = unit === "m" ? tUnits("m") : tUnits("ft");
  const max = maxRigLengthInUnit(unit);
  const invalidLengthParams = { max, unit: unitLabel };

  const onUnitChange = (nextUnit: RigLengthUnit) => {
    if (nextUnit === unit) return;
    setDraft(convertRigDraftOnUnitChange(draft, unit, nextUnit, locale));
    setUnit(nextUnit);
  };

  const parse = (): ParseRigLengthResult =>
    parseRigLengthToFeet(draft, unit);

  return {
    draft,
    setDraft,
    unit,
    onUnitChange,
    parse,
    unitLabel,
    max,
    /** ICU params for surface `errors.invalid…Length` messages. */
    invalidLengthParams,
  };
}
