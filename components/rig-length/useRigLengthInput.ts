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
  /** Canonical feet already stored (profile / site); null/undefined → empty draft. */
  initialFeet?: number | null;
  /**
   * Starting display unit. When omitted, defaults from locale (`fr*` → m).
   * Site admin passes `"ft"` to keep feet-first editing.
   */
  initialUnit?: RigLengthUnit;
};

/**
 * Shared draft + unit state for profile / site / search rig-length inputs
 * (issue #42). Canonical parse stays in feet via {@link parseRigLengthToFeet}.
 */
export function useRigLengthInput({
  initialFeet,
  initialUnit,
}: Options = {}) {
  const locale = useLocale();
  const tUnits = useTranslations("common.units");
  const startingUnit = initialUnit ?? defaultRigUnitForLocale(locale);

  const [unit, setUnit] = useState<RigLengthUnit>(startingUnit);
  const [draft, setDraft] = useState(() =>
    formatRigLengthForDisplay(initialFeet, startingUnit, locale),
  );

  const ftLabel = tUnits("ft");
  const mLabel = tUnits("m");
  const unitLabel = unit === "m" ? mLabel : ftLabel;
  const max = maxRigLengthInUnit(unit);

  const onUnitChange = (nextUnit: RigLengthUnit) => {
    if (nextUnit === unit) return;
    setDraft((prev) =>
      convertRigDraftOnUnitChange(prev, unit, nextUnit, locale),
    );
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
    ftLabel,
    mLabel,
    max,
  };
}
