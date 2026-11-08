import { BackHeader } from "@/components/layout/back-header";
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
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { routes } from "@/lib/routes";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

const PAGE_NAMESPACE = "campgrounds.CampgroundDetailsPage" as const;

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations(PAGE_NAMESPACE);
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

function groupAmenities(amenities: Amenity[]) {
  const grouped = amenities.reduce(
    (acc, amenity) => {
      const category = amenity.category_code?.trim() || "";
      if (!acc[category]) acc[category] = [];
      acc[category].push(amenity);
      return acc;
    },
    {} as Record<string, Amenity[]>,
  );

  return Object.fromEntries(
    Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => [
        category,
        items.sort((a, b) => a.code.localeCompare(b.code)),
      ]),
  );
}

export default async function CampgroundDetailsPage({ params }: PageProps) {
  const { locale, id } = await params;
  const [campgroundResult, sitesResult, amenitiesResult] = await Promise.all([
    getCampgroundById(id),
    getSitesOfCampground(id),
    getAmenitiesForCampground(id),
  ]);

  if (!campgroundResult.success) {
    notFound();
  }

  const campground = campgroundResult.data;
  const sites = sitesResult.success ? sitesResult.data : [];
  const amenities = amenitiesResult.success ? amenitiesResult.data : [];
  const groupedAmenities = groupAmenities(amenities);

  const t = await getTranslations(PAGE_NAMESPACE);
  const tc = await getTranslations("common");
  const tCampgrounds = await getTranslations("campgrounds");
  const tAmenities = await getTranslations("amenities");
  const tSites = await getTranslations("sites");

  const priceFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CAD",
  });

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

                  {campground.website ? (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">
                        {tCampgrounds("form.websiteLabel")}
                      </h3>
                      <a
                        href={campground.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {campground.website}
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
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tAmenities("plural")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 pt-2">
              {amenities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {tAmenities("noResult")}
                </p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedAmenities).map(([category, items]) => (
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
              {sites.length === 0 ? (
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
                      {sites.map((site) => (
                        <TableRow key={site.id}>
                          <TableCell className="font-medium">
                            {site.name}
                          </TableCell>
                          <TableCell>{site.description}</TableCell>
                          <TableCell>{site.site_type_code}</TableCell>
                          <TableCell>
                            {site.max_rig_length != null
                              ? site.max_rig_length
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {priceFormatter.format(
                              Number(site.price_per_night),
                            )}
                          </TableCell>
                          <TableCell>{site.min_stay_nights}</TableCell>
                        </TableRow>
                      ))}
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
