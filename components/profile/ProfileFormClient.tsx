"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import RigLengthInput from "@/components/rig-length/RigLengthInput";
import { useRigLengthInput } from "@/components/rig-length/useRigLengthInput";
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
  FULL_NAME_MAX_LENGTH,
  normalizePersonName,
} from "@/lib/profile-validation";
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
  const {
    draft: rigDraft,
    setDraft: setRigDraft,
    unit: rigUnit,
    unitTouched,
    onUnitChange: handleRigUnitChange,
    parse: parseRigDraft,
    invalidLengthParams,
  } = useRigLengthInput({
    initialFeet: profile.default_rig_length,
    // Saved preference wins; hook falls back to locale when omitted/null.
    initialUnit: profile.preferred_rig_unit ?? undefined,
  });

  const invalidRigLengthMessage = t_profile(
    "errors.invalidRigLength",
    invalidLengthParams,
  );

  const isFormValid = normalizePersonName(fullName).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedName = normalizePersonName(fullName);
    if (!normalizedName) {
      return setError(t_profile("errors.nameRequired"));
    }
    if (normalizedName.length > FULL_NAME_MAX_LENGTH) {
      return setError(
        t_profile("errors.nameTooLong", { max: FULL_NAME_MAX_LENGTH }),
      );
    }

    const trimmedRig = rigDraft.trim();
    let defaultRigLength: number | null = null;
    if (trimmedRig !== "") {
      const parsed = parseRigDraft();
      if (!parsed.ok) {
        return setError(invalidRigLengthMessage);
      }
      defaultRigLength = parsed.feet;
    }

    // Persist unit only when the guest toggled it or already has a saved
    // preference — don't freeze the locale fallback on an unrelated save.
    const payload: ProfileUpdateInput = {
      full_name: normalizedName,
      default_rig_length: defaultRigLength,
      ...(unitTouched || profile.preferred_rig_unit != null
        ? { preferred_rig_unit: rigUnit }
        : {}),
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
                  default_rig_length: invalidRigLengthMessage,
                  preferred_rig_unit: t_profile("errors.invalidRigUnit"),
                },
                fieldTooLongMessages: {
                  full_name: t_profile("errors.nameTooLong", {
                    max: FULL_NAME_MAX_LENGTH,
                  }),
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

      <form
        id="profile-form"
        noValidate
        onSubmit={handleSubmit}
        className="space-y-8"
      >
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
              maxLength={FULL_NAME_MAX_LENGTH}
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
            <RigLengthInput
              id="default_rig_length"
              name="default_rig_length"
              className="mt-1.5"
              value={rigDraft}
              onChange={(value) => {
                setRigDraft(value);
                setError(null);
              }}
              unit={rigUnit}
              onUnitChange={(next) => {
                handleRigUnitChange(next);
                setError(null);
              }}
              groupLabel={t_profile("form.rigLengthUnitGroupLabel")}
              placeholderFt={t_profile("form.rigLengthPlaceholderFt")}
              placeholderM={t_profile("form.rigLengthPlaceholderM")}
              hint={
                <>
                  {t_profile("form.defaultRigLengthHint")}{" "}
                  {t_profile("form.rigLengthStoredHint")}
                </>
              }
            />
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
