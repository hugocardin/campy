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
import { CommissionType } from "@/entities/commission-type";
import { UserProfileNoRole } from "@/entities/user-profile";
import {
  normalizeCommissionInput,
  parseCommissionTypeName,
} from "@/lib/campground-commission";
import {
  CAMPGROUND_CURRENCY_LOCKED_FIELD,
  type CampgroundCurrencyLockState,
} from "@/lib/campground-currency-lock";
import {
  GUEST_PRICE_CURRENCIES,
  GUEST_PRICE_CURRENCY,
  parseGuestPriceCurrency,
} from "@/lib/campground-price";
import {
  ActionResult,
  translateErrorCode,
  withErrorReference,
} from "@/lib/errors";
import { toSafeHttpUrl } from "@/lib/safe-http-url";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const COMMISSION_TYPE_NONE = "__none__";

type CampgroundFormProps = {
  owners: UserProfileNoRole[];
  commissionTypes: CommissionType[];
  initialData?: CampgroundFormData;
  onSubmit: (data: CampgroundCreateUpdateInput) => Promise<ActionResult>;
  /** When set on edit, listing currency control is disabled (#24/#51). */
  currencyLockReason?: CampgroundCurrencyLockState | null;
};

function currencyLockErrorMessage(
  reason: CampgroundCurrencyLockState,
  t: (key: string) => string,
): string {
  if (reason === "bookings") return t("errors.currencyLockedBookings");
  if (reason === "unknown") return t("errors.currencyLockedUnknown");
  return t("errors.currencyLockedSites");
}

function currencyLockHintMessage(
  reason: CampgroundCurrencyLockState,
  t: (key: string) => string,
): string {
  if (reason === "bookings") return t("form.currencyLockedHintBookings");
  if (reason === "unknown") return t("form.currencyLockedHintUnknown");
  return t("form.currencyLockedHintSites");
}

function commissionTypeLabel(
  name: string,
  t: (key: string) => string,
): string {
  const parsed = parseCommissionTypeName(name);
  if (parsed === "percent") return t("commissionTypes.percent");
  if (parsed === "fixed") return t("commissionTypes.fixed");
  return name;
}

export default function CampgroundFormClient({
  owners,
  commissionTypes,
  initialData,
  onSubmit,
  currencyLockReason = null,
}: CampgroundFormProps) {
  const tc = useTranslations("common");
  const t_errors = useTranslations("errors");
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
    currency: initialData?.currency ?? GUEST_PRICE_CURRENCY,
    website: initialData?.website ?? "",
    phone: initialData?.phone ?? "",
    location: {
      lat: initialData?.location?.lat ?? "",
      lng: initialData?.location?.lng ?? "",
    },
    commission_type_id: initialData?.commission_type_id ?? "",
    commission_value: initialData?.commission_value ?? "",
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
    if (form.website.trim() && !toSafeHttpUrl(form.website))
      return setError(t_campgrounds("errors.websiteInvalid"));
    if (!parseGuestPriceCurrency(form.currency))
      return setError(t_campgrounds("errors.currencyInvalid"));

    const commissionTypeId =
      form.commission_type_id.trim() === ""
        ? null
        : Number.parseInt(form.commission_type_id, 10);
    if (
      commissionTypeId != null &&
      (!Number.isInteger(commissionTypeId) ||
        !knownCommissionTypes.some((t) => t.id === commissionTypeId))
    ) {
      return setError(t_campgrounds("errors.commissionTypeInvalid"));
    }

    const selectedTypeRow =
      commissionTypeId == null
        ? null
        : knownCommissionTypes.find((t) => t.id === commissionTypeId);
    const selectedKnownType = parseCommissionTypeName(selectedTypeRow?.name);
    const selectedTypeName = selectedKnownType ?? null;
    if (commissionTypeId != null && selectedTypeName == null) {
      return setError(t_campgrounds("errors.commissionTypeInvalid"));
    }

    const commissionNormalized = normalizeCommissionInput({
      commission_type_id: commissionTypeId,
      commission_value: form.commission_value,
      typeName: selectedTypeName,
    });
    if (!commissionNormalized.ok) {
      if (commissionNormalized.field === "commission_type_id") {
        return setError(t_campgrounds("errors.commissionTypeInvalid"));
      }
      if (commissionNormalized.reason === "value_out_of_range") {
        return setError(
          selectedKnownType === "percent"
            ? t_campgrounds("errors.commissionValuePercentRange")
            : t_campgrounds("errors.commissionValueFixedRange"),
        );
      }
      return setError(t_campgrounds("errors.commissionValueInvalid"));
    }

    // Locked parks cannot change currency (DB trigger also rejects).
    if (
      currencyLockReason &&
      initialData?.currency &&
      form.currency !== initialData.currency
    ) {
      return setError(
        currencyLockErrorMessage(currencyLockReason, t_campgrounds),
      );
    }

    // Changing currency reinterprets existing site base prices (no FX) — #51.
    // Only offered when unlocked (no sites / amount-bookings yet).
    if (
      !currencyLockReason &&
      initialData?.id &&
      initialData.currency &&
      form.currency !== initialData.currency
    ) {
      const confirmed = window.confirm(
        t_campgrounds("form.currencyChangeConfirm", {
          from: initialData.currency,
          to: form.currency,
        }),
      );
      if (!confirmed) return;
    }

    const payload: CampgroundCreateUpdateInput = {
      id: initialData?.id,
      name: form.name,
      owner_id: form.owner_id,
      description: form.description,
      address: form.address,
      city: form.city,
      province: form.province,
      country: form.country,
      currency: form.currency,
      website: form.website,
      phone: form.phone,
      location: {
        lat: latNum,
        lng: lngNum,
      },
      commission_type_id: commissionNormalized.data.commission_type_id,
      commission_value: commissionNormalized.data.commission_value,
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
                  "campground.website": t_campgrounds("errors.websiteInvalid"),
                  "campground.currency": t_campgrounds("errors.currencyInvalid"),
                  "campground.commission_type_id": t_campgrounds(
                    "errors.commissionTypeInvalid",
                  ),
                  "campground.commission_value":
                    result.details?.reason === "value_out_of_range"
                      ? parseCommissionTypeName(
                          knownCommissionTypes.find(
                            (t) =>
                              String(t.id) === form.commission_type_id,
                          )?.name,
                        ) === "percent"
                        ? t_campgrounds("errors.commissionValuePercentRange")
                        : t_campgrounds("errors.commissionValueFixedRange")
                      : t_campgrounds("errors.commissionValueInvalid"),
                  [CAMPGROUND_CURRENCY_LOCKED_FIELD]:
                    result.details?.reason === "currency_locked_bookings"
                      ? t_campgrounds("errors.currencyLockedBookings")
                      : result.details?.reason === "currency_locked_sites"
                        ? t_campgrounds("errors.currencyLockedSites")
                        : t_campgrounds("errors.currencyLockedUnknown"),
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

  const handleOwnerChange = (value: string) => {
    setForm((prev) => ({ ...prev, owner_id: value }));
    setError(null);
  };

  const knownCommissionTypes = commissionTypes.filter((type) =>
    Boolean(parseCommissionTypeName(type.name)),
  );

  const handleCommissionTypeChange = (value: string) => {
    const nextId = value === COMMISSION_TYPE_NONE ? "" : value;
    setForm((prev) => ({
      ...prev,
      commission_type_id: nextId,
      // Reset amount whenever the type changes (percent ↔ fixed ↔ none).
      commission_value: nextId === "" ? "" : "0",
    }));
    setError(null);
  };

  const selectedCommissionTypeName = parseCommissionTypeName(
    knownCommissionTypes.find((t) => String(t.id) === form.commission_type_id)
      ?.name,
  );

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

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <Label htmlFor="currency">
                  {t_campgrounds("form.currencyLabel")}
                </Label>
                <Select
                  value={form.currency || GUEST_PRICE_CURRENCY}
                  disabled={Boolean(currencyLockReason)}
                  onValueChange={(value) => {
                    const currency =
                      parseGuestPriceCurrency(value) ?? GUEST_PRICE_CURRENCY;
                    setForm((prev) => ({ ...prev, currency }));
                  }}
                >
                  <SelectTrigger
                    id="currency"
                    className="mt-1.5"
                    aria-describedby="currency-hint"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_PRICE_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p
                  id="currency-hint"
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {currencyLockReason
                    ? currencyLockHintMessage(
                        currencyLockReason,
                        t_campgrounds,
                      )
                    : t_campgrounds("form.currencyHint")}
                </p>
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="commission_type_id">
                  {t_campgrounds("form.commissionTypeLabel")}
                </Label>
                <Select
                  value={
                    form.commission_type_id
                      ? form.commission_type_id
                      : COMMISSION_TYPE_NONE
                  }
                  onValueChange={handleCommissionTypeChange}
                >
                  <SelectTrigger
                    id="commission_type_id"
                    className="mt-1.5"
                    aria-describedby="commission-type-hint"
                  >
                    <SelectValue
                      placeholder={t_campgrounds(
                        "form.commissionTypePlaceholder",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COMMISSION_TYPE_NONE}>
                      {t_campgrounds("form.commissionTypeNone")}
                    </SelectItem>
                    {[...knownCommissionTypes]
                      .sort((a, b) => a.id - b.id)
                      .map((type) => (
                        <SelectItem key={type.id} value={String(type.id)}>
                          {commissionTypeLabel(type.name, t_campgrounds)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p
                  id="commission-type-hint"
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {t_campgrounds("form.commissionTypeHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="commission_value">
                  {selectedCommissionTypeName === "percent"
                    ? t_campgrounds("form.commissionValuePercentLabel")
                    : selectedCommissionTypeName === "fixed"
                      ? t_campgrounds("form.commissionValueFixedLabel")
                      : t_campgrounds("form.commissionValueLabel")}
                </Label>
                <Input
                  id="commission_value"
                  name="commission_value"
                  type="text"
                  inputMode="decimal"
                  value={form.commission_value}
                  onChange={handleChange}
                  disabled={!form.commission_type_id}
                  className="mt-1.5"
                  placeholder={
                    selectedCommissionTypeName === "percent"
                      ? t_campgrounds("form.commissionValuePercentPlaceholder")
                      : t_campgrounds("form.commissionValueFixedPlaceholder")
                  }
                  aria-describedby="commission-value-hint"
                />
                <p
                  id="commission-value-hint"
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {!form.commission_type_id
                    ? t_campgrounds("form.commissionValueHintNone")
                    : selectedCommissionTypeName === "percent"
                      ? t_campgrounds("form.commissionValuePercentHint")
                      : t_campgrounds("form.commissionValueFixedHint")}
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
