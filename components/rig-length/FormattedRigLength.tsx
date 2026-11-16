"use client";

import {
  formatRigLength,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { useLocale, useTranslations } from "next-intl";

type Props = {
  /** Canonical feet (`sites.max_rig_length`); null/undefined → empty. */
  feet: number | null | undefined;
  /** Leading unit; default feet. Guest detail may pass URL `rigUnit`. */
  primaryUnit?: RigLengthUnit;
  empty?: string;
};

/**
 * Dual ft/m site-card display (issue #34). Owns labels, locale decimals, and
 * the empty placeholder so call sites stay one-liners.
 */
export default function FormattedRigLength({
  feet,
  primaryUnit,
  empty = "—",
}: Props) {
  const t = useTranslations("sites");
  const locale = useLocale();
  return (
    formatRigLength(feet, {
      labels: {
        ft: t("form.rigLengthUnitFt"),
        m: t("form.rigLengthUnitM"),
      },
      locale,
      primaryUnit,
    }) ?? empty
  );
}
