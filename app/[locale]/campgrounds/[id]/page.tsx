import { BackHeader } from "@/components/layout/back-header";
import FormattedRigLength from "@/components/rig-length/FormattedRigLength";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAmenitiesForCampground } from "@/data/campgrounds/get-campground-amenities";
import { getCampgroundById } from "@/data/campgrounds/get-campground";
import { getSitesOfCampground } from "@/data/campgrounds/get-campground-sites";
import { Amenity } from "@/entities/amenity";
import { DbErrorCode } from "@/lib/errors";
import {
  formatElectricityAmps,
  unionElectricityAmps,
} from "@/lib/electricity-amps";
import { formatCampgroundPricePerNight } from "@/lib/campground-price";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { isUuid } from "@/lib/is-uuid";
import { normalizeSitePhotoUrls } from "@/lib/park-media";
import { routes } from "@/lib/routes";
import { toSafeHttpUrl } from "@/lib/safe-http-url";
import { parseRigLengthUnit } from "@/lib/site-rig-length";
import { translateCode } from "@/lib/translate-code";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";

const PAGE_NAMESPACE = "campgrounds.CampgroundDetailsPage" as const;

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type Translator = {
  (key: string): string;
  has: (key: string) => boolean;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations(PAGE_NAMESPACE);

  if (!isUuid(id)) {
    return {
      title: t("meta.titleFallback"),
      description: t("meta.descriptionFallback"),
    };
  }

  const result = await getCampgroundById(id);

  if (!result.success) {
    return {
      title: t("meta.titleFallback"),
      description: t("meta.descriptionFallback"),
    };
  }

  return {
    title: t("meta.title", { name: result.data.name }),
    description: t("meta.description", { name: result.data.name }),
  };
}

function groupAmenitiesForLocale(
  amenities: Amenity[],
  tAmenities: Translator,
  locale: string,
) {
  const grouped = amenities.reduce(
    (acc, amenity) => {
      const category = amenity.category_code?.trim() || "";
      if (!acc[category]) acc[category] = [];
      acc[category].push(amenity);
      return acc;
    },
    {} as Record<string, Amenity[]>,
  );

  return Object.entries(grouped)
    .map(([category, items]) => {
      const categoryLabel = translateCode(tAmenities, "categories", category);
      const sortedItems = [...items].sort((a, b) =>
        translateCode(tAmenities, "codes", a.code).localeCompare(
          translateCode(tAmenities, "codes", b.code),
          locale,
        ),
      );
      return { category, categoryLabel, items: sortedItems };
    })
    .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel, locale));
}

export default async function CampgroundDetailsPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, id } = await params;
  const query = await searchParams;
  const rawRigUnit = query.rigUnit;
  const primaryRigUnit = parseRigLengthUnit(
    Array.isArray(rawRigUnit) ? rawRigUnit[0] : rawRigUnit,
  );

  if (!isUuid(id)) {
    notFound();
  }

  const [campgroundResult, sitesResult, amenitiesResult] = await Promise.all([
    getCampgroundById(id),
    getSitesOfCampground(id),
    getAmenitiesForCampground(id),
  ]);

  if (!campgroundResult.success) {
    if (campgroundResult.errorCode === DbErrorCode.DB_NOT_FOUND) {
      notFound();
    }
    throw new Error(campgroundResult.errorCode ?? "campground_load_failed");
  }

  const campground = campgroundResult.data;
  const safeWebsite = toSafeHttpUrl(campground.website);
  const websiteLabel = campground.website?.trim() || safeWebsite;

  const t = await getTranslations(PAGE_NAMESPACE);
  const tc = await getTranslations("common");
  const tCampgrounds = await getTranslations("campgrounds");
  const tAmenities = await getTranslations("amenities");
  const tSites = await getTranslations("sites");

  if (!sitesResult.success) {
    console.error("sites load failed", sitesResult.errorCode, sitesResult.details);
  }
  if (!amenitiesResult.success) {
    console.error(
      "amenities load failed",
      amenitiesResult.errorCode,
      amenitiesResult.details,
    );
  }

  const sites = sitesResult.success ? sitesResult.data : null;
  const amenities = amenitiesResult.success ? amenitiesResult.data : null;
  const groupedAmenities =
    amenities != null
      ? groupAmenitiesForLocale(amenities, tAmenities, locale)
      : [];
  const campgroundAmpsNumbers =
    sites != null
      ? formatElectricityAmps(
          unionElectricityAmps(sites.map((site) => site.electricity_amps)),
        )
      : null;

  const locationLine = formatCampgroundLocation(
    campground.city,
    campground.province,
    campground.country,
  );

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <BackHeader
          title={campground.name}
          description={locationLine}
          backTo={routes.home()}
          leftContent={
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>
                {campground.address
                  ? `${campground.address}, ${locationLine}`
                  : locationLine}
              </span>
            </div>
          }
        />

        <div className="space-y-10">
          {campground.coverPhoto ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <Image
                src={campground.coverPhoto}
                alt={campground.name}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
              />
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{tc("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      {tCampgrounds("form.descriptionLabel")}
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {campground.description || t("noDescription")}
                    </p>
                  </div>

                  {safeWebsite ? (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tCampgrounds("form.websiteLabel")}
                      </h3>
                      <a
                        href={safeWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {websiteLabel}
                      </a>
                    </div>
                  ) : null}

                  {campground.phone ? (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tCampgrounds("form.phoneLabel")}
                      </h3>
                      <p>{campground.phone}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      {tCampgrounds("form.addressLabel")}
                    </h3>
                    <p>{campground.address}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tCampgrounds("form.cityLabel")}
                      </h3>
                      <p>{campground.city}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tCampgrounds("form.provinceLabel")}
                      </h3>
                      <p>{campground.province}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      {tCampgrounds("form.countryLabel")}
                    </h3>
                    <p>{campground.country}</p>
                  </div>

                  {sites != null ? (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tSites("electricityAmps.summaryLabel")}
                      </h3>
                      <p>
                        {campgroundAmpsNumbers != null
                          ? tSites("electricityAmps.list", {
                              amps: campgroundAmpsNumbers,
                            })
                          : tSites("electricityAmps.none")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tAmenities("plural")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 pt-2">
              {amenities == null ? (
                <p className="text-sm text-destructive">{t("amenitiesLoadError")}</p>
              ) : amenities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {tAmenities("noResult")}
                </p>
              ) : (
                <div className="space-y-6">
                  {groupedAmenities.map(({ category, categoryLabel, items }) => (
                    <div key={category} className="pb-2">
                      <h4 className="font-medium text-base mb-2.5 border-b pb-1 border-muted">
                        {categoryLabel}
                      </h4>
                      <div className="flex flex-wrap gap-2.5">
                        {items.map((amenity) => (
                          <Badge
                            key={amenity.id}
                            variant="secondary"
                            className="text-sm px-3 py-1"
                          >
                            {translateCode(tAmenities, "codes", amenity.code)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sitesHeading")}</CardTitle>
            </CardHeader>
            <CardContent>
              {sites == null ? (
                <p className="text-sm text-destructive">{t("sitesLoadError")}</p>
              ) : sites.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {tSites("noResult")}
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tSites("form.nameLabel")}</TableHead>
                        <TableHead>
                          {tSites("form.descriptionLabel")}
                        </TableHead>
                        <TableHead>{tSites("form.siteTypeLabel")}</TableHead>
                        <TableHead>
                          {tSites("form.electricityAmpsLabel")}
                        </TableHead>
                        <TableHead>
                          {tSites("form.maxRigLengthLabel")}
                        </TableHead>
                        <TableHead>
                          {tSites("form.pricePerNightLabel")}
                        </TableHead>
                        <TableHead>
                          {tSites("form.minStayNightLabel")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sites.map((site) => {
                        const guestPhotos = normalizeSitePhotoUrls(site.photos);
                        return (
                        <TableRow key={site.id}>
                          <TableCell className="font-medium">
                            <div className="space-y-2">
                              <span>{site.name}</span>
                              {guestPhotos.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {guestPhotos.slice(0, 4).map((url) => (
                                    <div
                                      key={url}
                                      className="relative h-12 w-16 overflow-hidden rounded bg-muted"
                                    >
                                      <Image
                                        src={url}
                                        alt={t("sitePhotoAlt", {
                                          name: site.name,
                                        })}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{site.description}</TableCell>
                          <TableCell>
                            {translateCode(
                              tSites,
                              "types",
                              site.site_type_code,
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const amps = formatElectricityAmps(
                                site.electricity_amps,
                              );
                              return amps != null
                                ? tSites("electricityAmps.list", { amps })
                                : tSites("electricityAmps.none");
                            })()}
                          </TableCell>
                          <TableCell>
                            <FormattedRigLength
                              feet={site.max_rig_length}
                              primaryUnit={primaryRigUnit}
                            />
                          </TableCell>
                          <TableCell>
                            {formatCampgroundPricePerNight(
                              Number(site.price_per_night),
                              locale,
                              campground.priceCurrency,
                              { fractionDigits: 2 },
                            )}
                          </TableCell>
                          <TableCell>{site.min_stay_nights}</TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
