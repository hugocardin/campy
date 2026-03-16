"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { updateCampgroundAction } from "@/app/actions/campgrounds-admin";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
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
import { CampgroundAdmin } from "@/entities/campground-admin";
import { UserProfileNoRole } from "@/entities/user-profile";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  campground: CampgroundAdmin;
  owners: UserProfileNoRole[];
};

type FormData = {
  name: string;
  owner_id: string;
  description: string;
  address: string;
  city: string;
  province: string;
  country: string;
  website: string;
  phone: string;
  location: {
    lat: string;
    lng: string;
  };
};

export default function CampgroundEditClient({ campground, owners }: Props) {
  const tc = useTranslations("common");
  const t = useTranslations("AdminCampgroundEditPage");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: campground.name,
    owner_id: campground.owner_id ?? "",
    description: campground.description || "",
    address: campground.address || "",
    city: campground.city || "",
    province: campground.province || "",
    country: campground.country || "",
    website: campground.website || "",
    phone: campground.phone || "",
    location: {
      lat: String(campground.location?.lat ?? ""),
      lng: String(campground.location?.lng ?? ""),
    },
  });

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

    // Client-side validation
    if (!form.name.trim()) {
      setError(t("errors.nameRequired"));
      return;
    }
    if (!form.owner_id) {
      setError(t("errors.ownerRequired"));
      return;
    }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError(t("errors.latitudeInvalid"));
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError(t("errors.longitudeInvalid"));
      return;
    }

    const payload = {
      id: campground.id,
      ...form,
      location: {
        lat: latNum,
        lng: lngNum,
      },
    };

    startTransition(async () => {
      const result = await updateCampgroundAction(payload);

      if (!result.success) {
        setError(result.error.message);
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

  const handleOwnerChange = (value: string) => {
    setForm((prev) => ({ ...prev, owner_id: value }));
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
                {t("form.nameLabel")} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="mt-1.5"
                placeholder={t("form.namePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="owner_id">
                {t("form.ownerLabel")} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.owner_id}
                onValueChange={handleOwnerChange}
                required
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={t("form.ownerPlaceholder")} />
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
              <Label htmlFor="description">{t("form.descriptionLabel")}</Label>
              <Textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={5}
                className="mt-1.5 resize-y"
                placeholder={t("form.descriptionPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="website">{t("form.websiteLabel")}</Label>
              <Input
                id="website"
                name="website"
                type="url"
                value={form.website}
                onChange={handleChange}
                placeholder={t("form.websitePlaceholder")}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="phone">{t("form.phoneLabel")}</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder={t("form.phonePlaceholder")}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="address">{t("form.addressLabel")}</Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t("form.addressPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">{t("form.cityLabel")}</Label>
                <Input
                  id="city"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder={t("form.cityPlaceholder")}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="province">{t("form.provinceLabel")}</Label>
                <Input
                  id="province"
                  name="province"
                  value={form.province}
                  onChange={handleChange}
                  placeholder={t("form.provincePlaceholder")}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">{t("form.countryLabel")}</Label>
              <Input
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
                className="mt-1.5"
                placeholder={t("form.countryPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">
                  {t("form.latitudeLabel")}{" "}
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
                  placeholder={t("form.latitudePlaceholder")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("form.latitudeRange")}
                </p>
              </div>

              <div>
                <Label htmlFor="lng">
                  {t("form.longitudeLabel")}{" "}
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
                  placeholder={t("form.longitudePlaceholder")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("form.longitudeRange")}
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
