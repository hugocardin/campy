import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllAmenities } from "@/data/amenities/get-amenities";
import { getAmenitiesForCampground } from "@/data/campgrounds/get-campground-amenities";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CampgroundAmenitiesClient from "./CampgroundAmenitiesClient";

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
        title={`${campground.name} - Manage campground's amenities`}
        description={`Owner: ${campground.owner_full_name} · ${campground.owner_email}`}
        backTo={routes.platformAdmin.campgroundView(campground.id)}
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
          campgroundId={campground.id}
          allAmenities={allAmenities}
          currentAmenities={currentAmenities}
        />
      </Suspense>
    </div>
  );
}
