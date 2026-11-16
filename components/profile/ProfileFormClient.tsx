"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import RigLengthUnitToggle from "@/components/rig-length/RigLengthUnitToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileUpdateInput } from "@/entities/profile_update_input";
import { UserProfile } from "@/entities/user-profile";
import {
  ActionResult,
  translateErrorCode,
  withErrorReference,
} from "@/lib/errors";
import {
  convertRigLengthDisplay,
  formatRigLengthForDisplay,
  maxRigLengthInUnit,
  parseRigLengthToFeet,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  profile: UserProfile;
  onSubmit: (input: ProfileUpdateInput) => Promise<ActionResult>;
};

export default function ProfileFormClient({ profile, onSubmit }: Props) {
  const tc = useTranslations("common");
  const t_errors = useTranslations("errors");
  const t_profile = useTranslations("profile");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(profile.full_name);
  const [rigUnit, setRigUnit] = useState<RigLengthUnit>("ft");
  const [rigDraft, setRigDraft] = useState(() =>
    formatRigLengthForDisplay(profile.default_rig_length, "ft"),
  );

  const isFormValid = fullName.trim().length > 0;

  const handleRigUnitChange = (nextUnit: RigLengthUnit) => {
    if (nextUnit === rigUnit) return;
    setRigDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed === "") return prev;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) return prev;
      const converted = convertRigLengthDisplay(n, rigUnit, nextUnit);
      return converted != null ? String(converted) : prev;
    });
    setRigUnit(nextUnit);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      return setError(t_profile("errors.nameRequired"));
    }

    const trimmedRig = rigDraft.trim();
    let defaultRigLength: number | null = null;
    if (trimmedRig !== "") {
      const parsed = parseRigLengthToFeet(trimmedRig, rigUnit);
      if (!parsed.ok) {
        return setError(
          t_profile("errors.invalidRigLength", {
            max: maxRigLengthInUnit(rigUnit),
            unit:
              rigUnit === "m"
                ? t_profile("form.rigLengthUnitM")
                : t_profile("form.rigLengthUnitFt"),
          }),
        );
      }
      defaultRigLength = parsed.feet;
    }

    const payload: ProfileUpdateInput = {
      full_name: trimmedName,
      default_rig_length: defaultRigLength,
    };

    startTransition(async () => {
      const result = await onSubmit(payload);

      if (!result.success) {
        setError(
          withErrorReference(
            translateErrorCode(
              result.errorCode,
              t_errors,
              tc("error"),
              result.details,
              {
                fieldMessages: {
                  full_name: t_profile("errors.nameRequired"),
                  default_rig_length: t_profile("errors.invalidRigLength", {
                    max: maxRigLengthInUnit(rigUnit),
                    unit:
                      rigUnit === "m"
                        ? t_profile("form.rigLengthUnitM")
                        : t_profile("form.rigLengthUnitFt"),
                  }),
                },
                fieldTooLongMessages: {
                  full_name: t_profile("errors.nameTooLong"),
                },
              },
            ),
            result.details,
            (errorId) => tc("errorReference", { errorId }),
          ),
        );
      }
    });
  };

  return (
    <div className="space-y-10">
      <ErrorAlert errorMsg={error} />

      <form id="profile-form" onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-6 max-w-xl">
          <div>
            <Label htmlFor="full_name">
              {t_profile("form.fullname")}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="full_name"
              name="full_name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError(null);
              }}
              required
              maxLength={120}
              className="mt-1.5"
              placeholder={t_profile("form.namePlaceholder")}
              autoComplete="name"
            />
          </div>

          <div>
            <Label htmlFor="email">{t_profile("form.email")}</Label>
            <Input
              id="email"
              name="email"
              value={profile.email}
              disabled
              readOnly
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t_profile("form.emailReadOnlyHint")}
            </p>
          </div>

          <div>
            <Label htmlFor="default_rig_length">
              {t_profile("form.defaultRigLengthLabel")}
            </Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="default_rig_length"
                name="default_rig_length"
                type="number"
                min={1}
                max={maxRigLengthInUnit(rigUnit)}
                step="any"
                value={rigDraft}
                onChange={(e) => {
                  setRigDraft(e.target.value);
                  setError(null);
                }}
                className="flex-1"
                placeholder={
                  rigUnit === "m"
                    ? t_profile("form.rigLengthPlaceholderM")
                    : t_profile("form.rigLengthPlaceholderFt")
                }
              />
              <RigLengthUnitToggle
                value={rigUnit}
                onChange={handleRigUnitChange}
                groupLabel={t_profile("form.rigLengthUnitGroupLabel")}
                ftLabel={t_profile("form.rigLengthUnitFt")}
                mLabel={t_profile("form.rigLengthUnitM")}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t_profile("form.defaultRigLengthHint")}{" "}
              {t_profile("form.rigLengthStoredHint")}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              form="profile-form"
              disabled={isPending || !isFormValid}
              size="lg"
              className={cn(
                "min-w-40",
                (isPending || !isFormValid) && "opacity-70 cursor-not-allowed",
              )}
            >
              {isPending ? (
                tc("processing")
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {tc("save")}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
