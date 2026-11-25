"use client";

import CampgroundCoverAdmin from "@/components/media/CampgroundCoverAdmin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amenity } from "@/entities/amenity";
import { CampgroundAdmin } from "@/entities/campground-admin";
import {
  formatCommissionFixed,
  formatCommissionPercent,
  formatCommissionUnknownValue,
  resolveCommissionDisplayKind,
} from "@/lib/campground-commission";
import { toSafeHttpUrl } from "@/lib/safe-http-url";
import { useLocale, useTranslations } from "next-intl";

type Props = {
  campground: CampgroundAdmin;
  amenities: Amenity[];
};

export default function CampgroundDetail({ campground, amenities }: Props) {
  const tc = useTranslations("common");
  const t_campgrounds = useTranslations("campgrounds");
  const t_amenities = useTranslations("amenities");
  const locale = useLocale();

  const groupedAndSorted = amenities.reduce(
    (acc, amenity) => {
      const category = amenity.category_code?.trim();
      if (!acc[category]) acc[category] = [];
      acc[category].push(amenity);
      return acc;
    },
    {} as Record<string, Amenity[]>,
  );

  // Sort categories and amenities inside each
  const sortedGroupedAmenities = Object.fromEntries(
    Object.entries(groupedAndSorted)
      .sort(([catA], [catB]) => catA.localeCompare(catB))
      .map(([category, items]) => [
        category,
        items.sort((a, b) => a.code.localeCompare(b.code)),
      ]),
  );

  const commissionKind = resolveCommissionDisplayKind(
    campground.commission_type_id,
    campground.commission_type_name,
  );
  const commissionTypeLabel =
    commissionKind === "percent"
      ? t_campgrounds("commissionTypes.percent")
      : commissionKind === "fixed"
        ? t_campgrounds("commissionTypes.fixed")
        : commissionKind === "unknown"
          ? t_campgrounds("commissionTypes.unknown")
          : t_campgrounds("form.commissionTypeNone");
  const commissionValueLabel =
    commissionKind === "percent"
      ? t_campgrounds("form.commissionValuePercentLabel")
      : commissionKind === "fixed"
        ? t_campgrounds("form.commissionValueFixedLabel")
        : t_campgrounds("form.commissionValueLabel");
  const commissionValueDisplay =
    commissionKind === "none"
      ? t_campgrounds("form.commissionValueUnset")
      : commissionKind === "percent"
        ? formatCommissionPercent(campground.commission_value, locale)
        : commissionKind === "fixed"
          ? formatCommissionFixed(
              campground.commission_value,
              locale,
              campground.currency,
            )
          : formatCommissionUnknownValue(
              campground.commission_value,
              locale,
            );

  return (
    <div className="space-y-10">
      <CampgroundCoverAdmin
        campgroundId={campground.id}
        coverPhoto={campground.coverPhoto}
      />

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>{tc("details")}</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
            {/* Left column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t_campgrounds("form.descriptionLabel")}
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {campground.description}
                </p>
              </div>

              {(() => {
                const safeWebsite = toSafeHttpUrl(campground.website);
                if (!safeWebsite) return null;
                return (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      {t_campgrounds("form.websiteLabel")}
                    </h3>
                    <a
                      href={safeWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      {campground.website.trim() || safeWebsite}
                    </a>
                  </div>
                );
              })()}

              {campground.phone && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.phoneLabel")}
                  </h3>
                  <p>{campground.phone}</p>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {t_campgrounds("form.addressLabel")}
                </h3>
                <p>{campground.address}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.cityLabel")}
                  </h3>
                  <p>{campground.city}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.provinceLabel")}
                  </h3>
                  <p>{campground.province}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.countryLabel")}
                  </h3>
                  <p>{campground.country}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.currencyLabel")}
                  </h3>
                  <p>{campground.currency}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.latitudeLabel")}
                  </h3>
                  <p>
                    {campground.location?.lat != null
                      ? campground.location.lat.toFixed(6)
                      : ""}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.longitudeLabel")}
                  </h3>
                  <p>
                    {campground.location?.lng != null
                      ? campground.location.lng.toFixed(6)
                      : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {t_campgrounds("form.commissionTypeLabel")}
                  </h3>
                  <p>{commissionTypeLabel}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {commissionValueLabel}
                  </h3>
                  <p>{commissionValueDisplay}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Amenities Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t_amenities("plural")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pt-2">
          {amenities.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {t_amenities("noResult")}
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(sortedGroupedAmenities).map(
                ([category, items]) => {
                  return (
                    <div key={category} className="pb-2">
                      <h4 className="font-medium text-base mb-2.5 capitalize border-b pb-1 border-muted">
                        {category}
                      </h4>
                      <div className="flex flex-wrap gap-2.5">
                        {items.map((amenity) => (
                          <Badge
                            key={amenity.id}
                            variant="secondary"
                            className="text-sm px-3 py-1"
                          >
                            {amenity.code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
