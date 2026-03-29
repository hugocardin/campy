"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { CampgroundFormData } from "@/components/campground/campground-form-utils";
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
import { CampgroundCreateUpdateInput } from "@/entities/campground_create_update_input";
import { UserProfileNoRole } from "@/entities/user-profile";
import { ActionResult } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type CampgroundFormProps = {
  owners: UserProfileNoRole[];
  initialData?: CampgroundFormData;
  onSubmit: (data: CampgroundCreateUpdateInput) => Promise<ActionResult>;
};

export default function CampgroundFormClient({
  owners,
  initialData,
  onSubmit,
}: CampgroundFormProps) {
  const tc = useTranslations("common");
  const t_campgrounds = useTranslations("campgrounds");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CampgroundFormData>(() => ({
    name: initialData?.name ?? "",
    owner_id: initialData?.owner_id ?? "",
    description: initialData?.description ?? "",
    address: initialData?.address ?? "",
    city: initialData?.city ?? "",
    province: initialData?.province ?? "",
    country: initialData?.country ?? "",
    website: initialData?.website ?? "",
    phone: initialData?.phone ?? "",
    location: {
      lat: initialData?.location?.lat ?? "",
      lng: initialData?.location?.lng ?? "",
    },
  }));

  const isFormValid = Boolean(
    form.name.trim() &&
    form.owner_id &&
    form.location.lat.trim() &&
    form.location.lng.trim() &&
    !isNaN(parseFloat(form.location.lat)) &&
    !isNaN(parseFloat(form.location.lng)),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(form.location.lat);
    const lngNum = parseFloat(form.location.lng);

    if (!form.name.trim())
      return setError(t_campgrounds("errors.nameRequired"));
    if (!form.owner_id) return setError(t_campgrounds("errors.ownerRequired"));
    if (isNaN(latNum) || latNum < -90 || latNum > 90)
      return setError(t_campgrounds("errors.latitudeInvalid"));
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180)
      return setError(t_campgrounds("errors.longitudeInvalid"));

    const payload: CampgroundCreateUpdateInput = {
      id: initialData?.id,
      name: form.name,
      owner_id: form.owner_id,
      description: form.description,
      address: form.address,
      city: form.city,
      province: form.province,
      country: form.country,
      website: form.website,
      phone: form.phone,
      location: {
        lat: latNum,
        lng: lngNum,
      },
    };

    startTransition(async () => {
      const result = await onSubmit(payload);

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

  const handleOwnerChange = (value: string) => {
    setForm((prev) => ({ ...prev, owner_id: value }));
    setError(null);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [name]: value,
      },
    }));
    setError(null);
  };

  const sortedOwners = [...owners].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  return (
    <div className="space-y-10">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      <form id="campground-form" onSubmit={handleSubmit} className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">
                {t_campgrounds("form.nameLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1.5"
                placeholder={t_campgrounds("form.namePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="owner_id">
                {t_campgrounds("form.ownerLabel")}{" "}
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.owner_id}
                onValueChange={handleOwnerChange}
                required
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={t_campgrounds("form.ownerPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.full_name
                        ? `${owner.full_name} (${owner.email})`
                        : owner.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">
                {t_campgrounds("form.descriptionLabel")}
              </Label>
              <Textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                className="mt-1.5 resize-y"
                placeholder={t_campgrounds("form.descriptionPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="website">
                {t_campgrounds("form.websiteLabel")}
              </Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={form.website}
                onChange={handleChange}
                placeholder={t_campgrounds("form.websitePlaceholder")}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="phone">{t_campgrounds("form.phoneLabel")}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder={t_campgrounds("form.phonePlaceholder")}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="address">
                {t_campgrounds("form.addressLabel")}
              </Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t_campgrounds("form.addressPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">{t_campgrounds("form.cityLabel")}</Label>
                <Input
                  id="city"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder={t_campgrounds("form.cityPlaceholder")}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="province">
                  {t_campgrounds("form.provinceLabel")}
                </Label>
                <Input
                  id="province"
                  name="province"
                  value={form.province}
                  onChange={handleChange}
                  placeholder={t_campgrounds("form.provincePlaceholder")}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">
                {t_campgrounds("form.countryLabel")}
              </Label>
              <Input
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t_campgrounds("form.countryPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">
                  {t_campgrounds("form.latitudeLabel")}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lat"
                  name="lat"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={form.location.lat}
                  onChange={handleLocationChange}
                  required
                  className="mt-1.5"
                  placeholder={t_campgrounds("form.latitudePlaceholder")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t_campgrounds("form.latitudeRange")}
                </p>
              </div>

              <div>
                <Label htmlFor="lng">
                  {t_campgrounds("form.longitudeLabel")}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lng"
                  name="lng"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={form.location.lng}
                  onChange={handleLocationChange}
                  required
                  className="mt-1.5"
                  placeholder={t_campgrounds("form.longitudePlaceholder")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t_campgrounds("form.longitudeRange")}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                form="campground-form"
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
