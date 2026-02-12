"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amenity } from "@/entities/amenity";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { Site } from "@/entities/sites";

type Props = {
  campground: CampgroundAdmin;
  site: Site;
  amenities: Amenity[];
};

export default function SiteViewClient({ site, amenities }: Props) {
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

  return (
    <div className="space-y-10">
      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
            {/* Left column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Name
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {site.name}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Description
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {site.description}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Site type
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {site.site_type_code}
                </p>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Price per night
                  </h3>
                  <p>{site.price_per_night}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Minimal stay nights
                  </h3>
                  <p>{site.min_stay_nights}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Max rig length
                </h3>
                <p>{site.max_rig_length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Amenities Section */}
      <Card>
        <CardHeader>
          <CardTitle>Amenities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pt-2">
          {amenities.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No amenities have been added for this site.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(sortedGroupedAmenities).map(
                ([category, items]) => {
                  return (
                    <div key={category} className="pb-2">
                      <h4 className="font-medium text-base mb-2.5 capitalize border-b pb-1 border-muted">
                        {category.replace(/_/g, " ")}
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
