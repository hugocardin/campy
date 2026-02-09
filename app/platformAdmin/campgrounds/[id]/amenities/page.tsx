import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getAmenitiesForCampground } from "@/data/campgrounds/get-campground-amenities";
import { BackHeader } from "@/components/layout/back-header";
import CampgroundAmenitiesClient from "./CampgroundAmenitiesClient";
import { getAllAmenities } from "@/data/amenities/get-amenities";

export const metadata = {
  title: "Admin - Campground' amenities",
  description: "Manage a campground's amenities",
};

export default async function CampgroundAmenitiesPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;
  const [campgroundResult, currentAmenitiesResult, allAmenitiesResult] =
    await Promise.all([
      getCampgroundAdminById(params.id),
      getAmenitiesForCampground(params.id),
      getAllAmenities(),
    ]);

  if (
    !campgroundResult.success ||
    !currentAmenitiesResult.success ||
    !allAmenitiesResult.success
  ) {
    redirect(routes.platformAdmin.campgrounds());
  }

  const campground = campgroundResult.data!;
  const currentAmenities = currentAmenitiesResult.data!;
  const allAmenities = allAmenitiesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={campground.name}
        description={`Owner: ${campground.owner_full_name} · ${campground.owner_email}`}
        backTo={routes.platformAdmin.campgroundDetails(campground.id)}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-50 w-full" />
          </div>
        }
      >
        <CampgroundAmenitiesClient
          campground={campground}
          allAmenities={allAmenities}
          currentAmenities={currentAmenities}
        />
      </Suspense>
    </div>
  );
}
