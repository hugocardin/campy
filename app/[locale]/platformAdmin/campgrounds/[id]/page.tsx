import { Skeleton } from "@/components/ui/skeleton";
import { getAmenitiesForCampground } from "@/data/campgrounds/get-campground-amenities";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CampgroundClient from "./CampgroundClient";
import { CampgroundHeader } from "./CampgroundHeader";

const PAGE_NAMESPACE = "campgrounds.AdminCampgroundDetailsPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function CampgroundDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;
  const [campgroundResult, amenitiesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getAmenitiesForCampground(params.id),
  ]);

  if (!campgroundResult.success || !amenitiesResult.success) {
    redirect(routes.platformAdmin.campgrounds());
  }

  const campground = campgroundResult.data!;
  const amenities = amenitiesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <CampgroundHeader campground={campground} />

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
        <CampgroundClient campground={campground} amenities={amenities} />
      </Suspense>
    </div>
  );
}
