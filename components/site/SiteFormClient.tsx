"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { SiteFormData } from "@/components/site/site-form-utils";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { ActionResult } from "@/lib/errors";

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
  const t_sites = useTranslations("sites");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<SiteFormData>(() => ({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    site_type_id: initialData?.site_type_id ?? "",
    max_rig_length: initialData?.max_rig_length ?? "",
    price_per_night: initialData?.price_per_night ?? "",
    min_stay_nights: initialData?.min_stay_nights ?? "",
  }));

  const isFormValid = Boolean(
    form.name.trim() &&
    form.site_type_id &&
    form.price_per_night &&
    !isNaN(parseFloat(form.price_per_night)) &&
    !isNaN(parseFloat(form.min_stay_nights || "0")),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const maxRigLengthNum = parseFloat(form.max_rig_length);
    const pricePerNightNum = parseFloat(form.price_per_night);
    const minStayNightsNum = parseFloat(form.min_stay_nights);
    const siteTypeIdNum = parseInt(form.site_type_id, 10);

    if (!form.name.trim()) return setError(t_sites("errors.nameRequired"));
    if (!form.site_type_id) return setError(t_sites("errors.typeRequired"));
    if (!form.price_per_night) return setError(t_sites("errors.priceRequired"));
    if (!isNaN(maxRigLengthNum) && maxRigLengthNum < 0) {
      return setError(t_sites("errors.invalidMaxLength"));
    }
    if (isNaN(pricePerNightNum) || pricePerNightNum < 0) {
      return setError(t_sites("errors.invalidPricePerNight"));
    }
    if (!isNaN(minStayNightsNum) && minStayNightsNum < 0) {
      return setError(t_sites("errors.invalidMinStayNights"));
    }
    if (isNaN(siteTypeIdNum)) {
      return setError(t_sites("typeRequired"));
    }

    const payload: SiteCreateUpdateInput = {
      id: initialData?.id,
      name: form.name,
      description: form.description,
      site_type_id: siteTypeIdNum,
      max_rig_length: isNaN(maxRigLengthNum) ? undefined : maxRigLengthNum,
      price_per_night: pricePerNightNum,
      min_stay_nights: isNaN(minStayNightsNum) ? undefined : minStayNightsNum,
    };

    startTransition(async () => {
      const result = await onSubmit(campgroundId, payload);

      if (!result.success) {
        setError(result.errorCode);
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
    setForm((prev) => ({ ...prev, site_type_id: value }));
    setError(null);
  };

  const sortedSiteTypes = [...siteTypes].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

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

            <div>
              <Label htmlFor="max_rig_length">
                {t_sites("form.maxRigLengthLabel")}
              </Label>
              <Input
                id="max_rig_length"
                name="max_rig_length"
                type="number"
                value={form.max_rig_length}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t_sites("form.maxRigLengthPlaceholder")}
              />
            </div>
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
