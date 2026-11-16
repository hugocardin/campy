"use client";

import RigLengthUnitToggle from "@/components/rig-length/RigLengthUnitToggle";
import { Input } from "@/components/ui/input";
import type { RigLengthUnit } from "@/lib/site-rig-length";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Props = {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  unit: RigLengthUnit;
  onUnitChange: (unit: RigLengthUnit) => void;
  /** Accessible name for the ft/m toggle group (surface-specific copy). */
  groupLabel: string;
  placeholderFt: string;
  placeholderM: string;
  /**
   * Marks the field required for a11y + app validation. Does **not** set the
   * HTML `required` attribute — callers that need browser constraint checks on
   * sibling fields should keep native validation on the form.
   */
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Optional hint under the field (stored-in-feet, required, etc.). */
  hint?: ReactNode;
  autoComplete?: string;
};

/**
 * Shared rig-length field: text + `inputMode="decimal"`, per-unit placeholder,
 * and ft/m toggle wired to `common.units` labels (issue #42).
 *
 * Callers own draft/unit state (or {@link useRigLengthInput}) so profile,
 * site admin, and guest search can keep their required/optional and URL UX.
 */
export default function RigLengthInput({
  id,
  name,
  value,
  onChange,
  unit,
  onUnitChange,
  groupLabel,
  placeholderFt,
  placeholderM,
  required,
  disabled,
  className,
  inputClassName,
  hint,
  autoComplete,
}: Props) {
  const tUnits = useTranslations("common.units");
  const hintId = hint != null ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-required={required || undefined}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClassName ?? "flex-1")}
          placeholder={unit === "m" ? placeholderM : placeholderFt}
        />
        <RigLengthUnitToggle
          value={unit}
          onChange={onUnitChange}
          disabled={disabled}
          groupLabel={groupLabel}
          ftLabel={tUnits("ft")}
          mLabel={tUnits("m")}
        />
      </div>
      {hint != null ? (
        <p id={hintId} className="text-xs text-muted-foreground mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
