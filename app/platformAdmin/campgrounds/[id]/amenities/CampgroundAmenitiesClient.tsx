"use client";

import { updateCampgroundAmenitiesAction } from "@/app/actions/campgrounds-admin";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Amenity } from "@/entities/amenity";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

type Props = {
  campground: CampgroundAdmin;
  // all available amenities in the system
  allAmenities: Amenity[];
  // currently selected amenities for this campground
  currentAmenities: Amenity[];
};

export default function CampgroundAmenitiesClient({
  campground,
  allAmenities,
  currentAmenities,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentAmenities.map((a) => a.id)),
  );

  // Group all amenities by category
  const groupedAmenities = allAmenities.reduce(
    (acc, amenity) => {
      const category = amenity.category_code?.trim() || "Uncategorized";
      if (!acc[category]) acc[category] = [];
      acc[category].push(amenity);
      return acc;
    },
    {} as Record<string, Amenity[]>,
  );

  // Sort categories alphabetically + sort amenities inside each category
  const sortedGrouped = Object.fromEntries(
    Object.entries(groupedAmenities)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, items]) => [
        cat,
        [...items].sort((a, b) => a.code.localeCompare(b.code)),
      ]),
  );

  const handleCheckboxChange = (amenityId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(amenityId);
      } else {
        newSet.delete(amenityId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    setError(null);

    startTransition(async () => {
      const result = await updateCampgroundAmenitiesAction({
        campgroundId: campground.id,
        amenityIds: Array.from(selectedIds),
      });

      if (!result.success) {
        setError(result.error.code);
        return;
      }
    });
  };

  return (
    <div className="space-y-10">
      <Card>
        <CardHeader>
          <CardTitle>Manage Amenities — {campground.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-8">
          {allAmenities.length === 0 ? (
            <p className="text-muted-foreground italic">
              No amenities defined in the system yet.
            </p>
          ) : (
            <div className="space-y-8">
              {Object.entries(sortedGrouped).map(([category, items]) => (
                <div key={category} className="space-y-4">
                  <h3 className="font-medium text-lg capitalize border-b pb-2 border-muted">
                    {category.replace(/_/g, " ")}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map((amenity) => {
                      const isSelected = selectedIds.has(amenity.id);
                      return (
                        <div
                          key={amenity.id}
                          className="flex items-center space-x-3 py-1"
                        >
                          <Checkbox
                            id={`amenity-${amenity.id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(amenity.id, !!checked)
                            }
                          />
                          <Label
                            htmlFor={`amenity-${amenity.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {amenity.code}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-6 border-t">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="min-w-30"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
