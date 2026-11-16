"use client";

import { Button } from "@/components/ui/button";
import type { RigLengthUnit } from "@/lib/site-rig-length";
import { cn } from "@/lib/utils";

type Props = {
  value: RigLengthUnit;
  onChange: (unit: RigLengthUnit) => void;
  disabled?: boolean;
  /** Accessible name for the toggle group. */
  groupLabel: string;
  ftLabel: string;
  mLabel: string;
  className?: string;
};

/**
 * Compact ft / m toggle for guest search and admin site form (issue #32).
 */
export default function RigLengthUnitToggle({
  value,
  onChange,
  disabled,
  groupLabel,
  ftLabel,
  mLabel,
  className,
}: Props) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className={cn(
        "inline-flex rounded-md border border-input shadow-sm",
        className,
      )}
    >
      <Button
        type="button"
        size="sm"
        variant={value === "ft" ? "default" : "ghost"}
        className="rounded-r-none h-8 px-2.5"
        disabled={disabled}
        aria-pressed={value === "ft"}
        onClick={() => onChange("ft")}
      >
        {ftLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "m" ? "default" : "ghost"}
        className="rounded-l-none h-8 px-2.5 border-l border-input"
        disabled={disabled}
        aria-pressed={value === "m"}
        onClick={() => onChange("m")}
      >
        {mLabel}
      </Button>
    </div>
  );
}
