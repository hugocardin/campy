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

type UncontrolledOptions = {
  /**
   * Starting display unit. When omitted, defaults from locale (`fr*` → m).
   */
  initialUnit?: RigLengthUnit;
  /** Canonical feet already stored; null/undefined → empty draft. */
  initialFeet?: number | null;
  draft?: never;
  onDraftChange?: never;
};

type ControlledOptions = {
  /**
   * Starting display unit. Site admin passes `"ft"` to keep feet-first editing.
   * When omitted, defaults from locale (`fr*` → m).
   */
  initialUnit?: RigLengthUnit;
  /** Not used in controlled mode — draft comes from the caller. */
  initialFeet?: never;
  /** Controlled draft (e.g. `form.max_rig_length` on site admin). */
  draft: string;
  onDraftChange: (draft: string) => void;
};

export type UseRigLengthInputOptions = UncontrolledOptions | ControlledOptions;

/**
 * Shared draft + unit state for profile / site / search rig-length inputs
 * (issue #42). Canonical parse stays in feet via {@link parseRigLengthToFeet}.
 *
 * Pass either uncontrolled (`initialFeet`) or controlled (`draft` +
 * `onDraftChange`) — the discriminated union rejects mixing them.
 */
export function useRigLengthInput(
  options: UseRigLengthInputOptions = {},
) {
  const { initialUnit } = options;
  const locale = useLocale();
  const tUnits = useTranslations("common.units");
  const startingUnit = initialUnit ?? defaultRigUnitForLocale(locale);
  const isControlled = options.onDraftChange !== undefined;

  const [unit, setUnit] = useState<RigLengthUnit>(startingUnit);
  const [unitTouched, setUnitTouched] = useState(false);
  const [internalDraft, setInternalDraft] = useState(() =>
    isControlled
      ? ""
      : formatRigLengthForDisplay(
          options.initialFeet,
          startingUnit,
          locale,
        ),
  );

  const draft = isControlled ? options.draft : internalDraft;
  const setDraft = isControlled ? options.onDraftChange : setInternalDraft;

  const unitLabel = unit === "m" ? tUnits("m") : tUnits("ft");
  const max = maxRigLengthInUnit(unit);
  const invalidLengthParams = { max, unit: unitLabel };

  const onUnitChange = (nextUnit: RigLengthUnit) => {
    if (nextUnit === unit) return;
    setDraft(convertRigDraftOnUnitChange(draft, unit, nextUnit, locale));
    setUnit(nextUnit);
    setUnitTouched(true);
  };

  const parse = (): ParseRigLengthResult =>
    parseRigLengthToFeet(draft, unit);

  return {
    draft,
    setDraft,
    unit,
    /** True after the guest changes the unit toggle (not the locale default). */
    unitTouched,
    onUnitChange,
    parse,
    unitLabel,
    max,
    /** ICU params for surface `errors.invalid…Length` messages. */
    invalidLengthParams,
  };
}
