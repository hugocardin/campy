"use client";

import { Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { SiteFormData } from "@/components/site/site-form-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SiteType } from "@/entities/site-type";
import { SiteCreateUpdateInput } from "@/entities/site_create_update_input";
import type { DrivewayType } from "@/lib/driveway-type";
import { DRIVEWAY_TYPES } from "@/lib/driveway-type";
import {
  ELECTRICITY_AMP_VALUES,
  type ElectricityAmp,
  normalizeElectricityAmps,
} from "@/lib/electricity-amps";
import RigLengthUnitToggle from "@/components/rig-length/RigLengthUnitToggle";
import {
  convertRigLengthDisplay,
  isLodgingSiteType,
  maxRigLengthInUnit,
  parseRigLengthToFeet,
  siteTypeRequiresMaxRigLength,
  type RigLengthUnit,
} from "@/lib/site-rig-length";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  ActionResult,
  translateErrorCode,
  withErrorReference,
} from "@/lib/errors";

const AMP_LABEL_KEYS = {
  15: "amp15",
  20: "amp20",
  30: "amp30",
  50: "amp50",
} as const satisfies Record<ElectricityAmp, string>;

const DRIVEWAY_NONE = "__none__";

type SiteFormProps = {
  campgroundId: string;
  siteTypes: SiteType[];
  initialData?: SiteFormData;
  onSubmit: (
    campgroundId: string,
    site: SiteCreateUpdateInput,
  ) => Promise<ActionResult>;
};

export default function SiteFormClient({
  campgroundId,
  siteTypes,
  initialData,
  onSubmit,
}: SiteFormProps) {
  const tc = useTranslations("common");
  const t_errors = useTranslations("errors");
  const t_sites = useTranslations("sites");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // initialData.max_rig_length is canonical feet (string from site-form-utils).
  const [form, setForm] = useState<SiteFormData>(() => ({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    site_type_id: initialData?.site_type_id ?? "",
    max_rig_length: initialData?.max_rig_length ?? "",
    price_per_night: initialData?.price_per_night ?? "",
    min_stay_nights: initialData?.min_stay_nights ?? "",
    electricity_amps: normalizeElectricityAmps(
      initialData?.electricity_amps ?? [],
    ),
    driveway_type: initialData?.driveway_type ?? "",
  }));
  const [rigUnit, setRigUnit] = useState<RigLengthUnit>("ft");

  const selectedTypeCode = useMemo(() => {
    if (!form.site_type_id) return undefined;
    return siteTypes.find((t) => String(t.id) === form.site_type_id)?.code;
  }, [form.site_type_id, siteTypes]);

  const isLodging = isLodgingSiteType(selectedTypeCode);
  const requiresMaxRig = siteTypeRequiresMaxRigLength(selectedTypeCode);

  const maxRigParsed = parseRigLengthToFeet(form.max_rig_length, rigUnit);
  const isFormValid = Boolean(
    form.name.trim() &&
    form.site_type_id &&
    form.price_per_night &&
    !isNaN(parseFloat(form.price_per_night)) &&
    !isNaN(parseFloat(form.min_stay_nights || "0")) &&
    (!requiresMaxRig || maxRigParsed.ok),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const maxRigParsedSubmit = parseRigLengthToFeet(
      form.max_rig_length,
      rigUnit,
    );
    const pricePerNightNum = parseFloat(form.price_per_night);
    const minStayNightsNum = parseFloat(form.min_stay_nights);
    const siteTypeIdNum = parseInt(form.site_type_id, 10);

    if (!form.name.trim()) return setError(t_sites("errors.nameRequired"));
    if (!form.site_type_id) return setError(t_sites("errors.typeRequired"));
    if (!form.price_per_night) return setError(t_sites("errors.priceRequired"));
    if (isLodging) {
      // Lodging: force null max_rig_length (issue #27).
    } else if (requiresMaxRig) {
      if (!maxRigParsedSubmit.ok && maxRigParsedSubmit.reason === "empty") {
        return setError(t_sites("errors.maxRigLengthRequired"));
      }
      if (!maxRigParsedSubmit.ok) {
        return setError(
          t_sites("errors.invalidMaxLength", {
            max: maxRigLengthInUnit(rigUnit),
            unit:
              rigUnit === "m"
                ? t_sites("form.rigLengthUnitM")
                : t_sites("form.rigLengthUnitFt"),
          }),
        );
      }
    } else if (form.max_rig_length.trim() !== "" && !maxRigParsedSubmit.ok) {
      return setError(
        t_sites("errors.invalidMaxLength", {
          max: maxRigLengthInUnit(rigUnit),
          unit:
            rigUnit === "m"
              ? t_sites("form.rigLengthUnitM")
              : t_sites("form.rigLengthUnitFt"),
        }),
      );
    }
    if (isNaN(pricePerNightNum) || pricePerNightNum < 0) {
      return setError(t_sites("errors.invalidPricePerNight"));
    }
    if (!isNaN(minStayNightsNum) && minStayNightsNum < 0) {
      return setError(t_sites("errors.invalidMinStayNights"));
    }
    if (isNaN(siteTypeIdNum)) {
      return setError(t_sites("errors.typeRequired"));
    }

    const driveway: DrivewayType | null = isLodging
      ? null
      : form.driveway_type === ""
        ? null
        : form.driveway_type;

    const payload: SiteCreateUpdateInput = {
      id: initialData?.id,
      name: form.name,
      description: form.description,
      site_type_id: siteTypeIdNum,
      max_rig_length: isLodging
        ? undefined
        : maxRigParsedSubmit.ok
          ? maxRigParsedSubmit.feet
          : undefined,
      price_per_night: pricePerNightNum,
      min_stay_nights: isNaN(minStayNightsNum) ? undefined : minStayNightsNum,
      electricity_amps: normalizeElectricityAmps(form.electricity_amps),
      driveway_type: driveway,
    };

    startTransition(async () => {
      const result = await onSubmit(campgroundId, payload);

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
                  electricity_amps: t_sites("errors.invalidElectricityAmps"),
                  driveway_type: t_sites("errors.invalidDrivewayType"),
                  max_rig_length: t_sites("errors.maxRigLengthRequired"),
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSiteTypeChange = (value: string) => {
    const nextCode = siteTypes.find((t) => String(t.id) === value)?.code;
    setForm((prev) => ({
      ...prev,
      site_type_id: value,
      // Clear rig length + driveway when switching to lodging.
      max_rig_length: isLodgingSiteType(nextCode) ? "" : prev.max_rig_length,
      driveway_type: isLodgingSiteType(nextCode) ? "" : prev.driveway_type,
    }));
    setError(null);
  };

  const handleRigUnitChange = (nextUnit: RigLengthUnit) => {
    if (nextUnit === rigUnit) return;
    setForm((prev) => {
      const trimmed = prev.max_rig_length.trim();
      if (trimmed === "") return prev;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) return prev;
      const converted = convertRigLengthDisplay(n, rigUnit, nextUnit);
      return {
        ...prev,
        max_rig_length:
          converted != null ? String(converted) : prev.max_rig_length,
      };
    });
    setRigUnit(nextUnit);
    setError(null);
  };

  const handleAmpToggle = (amp: ElectricityAmp, checked: boolean) => {
    setForm((prev) => {
      const set = new Set(prev.electricity_amps);
      if (checked) set.add(amp);
      else set.delete(amp);
      return {
        ...prev,
        electricity_amps: normalizeElectricityAmps([...set]),
      };
    });
    setError(null);
  };

  const sortedSiteTypes = [...siteTypes].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  const selectedAmps = new Set(form.electricity_amps);

  return (
    <div className="space-y-10">
      <ErrorAlert errorMsg={error} />

      <form id="site-form" onSubmit={handleSubmit} className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">
                {t_sites("form.nameLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1.5"
                placeholder={t_sites("form.namePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="description">
                {t_sites("form.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                className="mt-1.5 resize-y"
                placeholder={t_sites("form.descriptionPlaceholder")}
              />
            </div>

            {!isLodging ? (
              <div>
                <Label htmlFor="max_rig_length">
                  {t_sites("form.maxRigLengthLabel")}
                  {requiresMaxRig ? (
                    <span className="text-red-500"> *</span>
                  ) : null}
                </Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    id="max_rig_length"
                    name="max_rig_length"
                    type="number"
                    min={1}
                    max={maxRigLengthInUnit(rigUnit)}
                    step="any"
                    value={form.max_rig_length}
                    onChange={handleChange}
                    className="flex-1"
                    placeholder={
                      rigUnit === "m"
                        ? t_sites("form.maxRigLengthPlaceholderM")
                        : t_sites("form.maxRigLengthPlaceholderFt")
                    }
                    required={requiresMaxRig}
                  />
                  <RigLengthUnitToggle
                    value={rigUnit}
                    onChange={handleRigUnitChange}
                    groupLabel={t_sites("form.rigLengthUnitGroupLabel")}
                    ftLabel={t_sites("form.rigLengthUnitFt")}
                    mLabel={t_sites("form.rigLengthUnitM")}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {requiresMaxRig
                    ? t_sites("form.maxRigLengthRequiredHint")
                    : null}
                  {requiresMaxRig ? " " : null}
                  {t_sites("form.maxRigLengthStoredHint")}
                </p>
              </div>
            ) : null}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="site_type_id">
                {t_sites("form.siteTypeLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.site_type_id}
                onValueChange={handleSiteTypeChange}
                required
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={t_sites("form.siteTypePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedSiteTypes.map((siteType) => (
                    <SelectItem key={siteType.id} value={String(siteType.id)}>
                      {siteType.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="price_per_night">
                {t_sites("form.pricePerNightLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="price_per_night"
                name="price_per_night"
                type="number"
                step="0.01"
                value={form.price_per_night}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t_sites("form.pricePerNightPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="min_stay_nights">
                {t_sites("form.minStayNightLabel")}
              </Label>
              <Input
                id="min_stay_nights"
                name="min_stay_nights"
                type="number"
                min="0"
                value={form.min_stay_nights}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t_sites("form.minStayNightPlaceholder")}
              />
            </div>

            {!isLodging ? (
              <div>
                <Label htmlFor="driveway_type">
                  {t_sites("form.drivewayLabel")}
                </Label>
                <Select
                  value={form.driveway_type || DRIVEWAY_NONE}
                  onValueChange={(value) => {
                    setForm((prev) => ({
                      ...prev,
                      driveway_type:
                        value === DRIVEWAY_NONE
                          ? ""
                          : (value as DrivewayType),
                    }));
                    setError(null);
                  }}
                >
                  <SelectTrigger id="driveway_type" className="mt-1.5">
                    <SelectValue
                      placeholder={t_sites("form.drivewayPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DRIVEWAY_NONE}>
                      {t_sites("form.drivewayPlaceholder")}
                    </SelectItem>
                    {DRIVEWAY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === "PULL_THROUGH"
                          ? t_sites("form.drivewayPullThrough")
                          : t_sites("form.drivewayBackIn")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t_sites("form.drivewayHint")}
                </p>
              </div>
            ) : null}

            <fieldset className="space-y-2 border-0 p-0 m-0">
              <legend className="text-sm font-medium leading-none">
                {t_sites("form.electricityAmpsLabel")}
              </legend>
              <p className="text-xs text-muted-foreground">
                {t_sites("form.electricityAmpsHint")}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {ELECTRICITY_AMP_VALUES.map((amp) => {
                  const id = `electricity-amp-${amp}`;
                  return (
                    <div key={amp} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={selectedAmps.has(amp)}
                        onCheckedChange={(checked) =>
                          handleAmpToggle(amp, checked === true)
                        }
                      />
                      <Label
                        htmlFor={id}
                        className="font-normal cursor-pointer"
                      >
                        {t_sites(`electricityAmps.${AMP_LABEL_KEYS[amp]}`)}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                form="site-form"
                disabled={isPending || !isFormValid}
                size="lg"
                className={cn(
                  "min-w-40",
                  (isPending || !isFormValid) &&
                    "opacity-70 cursor-not-allowed",
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
        </div>
      </form>
    </div>
  );
}
