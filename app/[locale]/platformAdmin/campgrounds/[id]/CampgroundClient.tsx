"use client";

import { CampgroundAdmin } from "@/entities/campground-admin";
import { Amenity } from "@/entities/amenity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  campground: CampgroundAdmin;
  amenities: Amenity[];
};

export default function CampgroundDetail({ campground, amenities }: Props) {
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
                  Description
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {campground.description || "No description provided"}
                </p>
              </div>

              {campground.website && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Website
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
              )}

              {campground.phone && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Phone
                  </h3>
                  <p>{campground.phone}</p>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Address
                </h3>
                <p>{campground.address || "—"}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    City
                  </h3>
                  <p>{campground.city || "—"}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Province / State
                  </h3>
                  <p>{campground.province || "—"}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Country
                </h3>
                <p>{campground.country || "—"}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Latitude
                  </h3>
                  <p>
                    {campground.location?.lat != null
                      ? campground.location.lat.toFixed(6)
                      : "—"}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Longitude
                  </h3>
                  <p>
                    {campground.location?.lng != null
                      ? campground.location.lng.toFixed(6)
                      : "—"}
                  </p>
                </div>
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
              No amenities have been added for this campground.
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
