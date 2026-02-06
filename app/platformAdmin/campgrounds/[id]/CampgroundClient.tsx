"use client";

import { CampgroundAdmin } from "@/app/entities/campground-admin";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  campground: CampgroundAdmin;
};

export default function CampgroundDetail({ campground }: Props) {
  return (
    <div className="space-y-10">
      {/* Details */}
      <Card>
        <CardContent className="pt-6">
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
    </div>
  );
}
