import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllAmenities } from "@/data/amenities/get-amenities";
import { getSiteOfCampground } from "@/data/campgrounds/get-campground-sites";
import { getAmenitiesForSite } from "@/data/sites/get-site-amenities";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SiteAmenitiesClient from "./SiteAmenitiesClient";

export const metadata = {
  title: "Admin - Site' amenities",
  description: "Manage a site's amenities",
};

export default async function SiteAmenitiesPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; siteId: string }>;
}) {
  const params = await paramsPromise;

  const [siteResult, currentAmenitiesResult, allAmenitiesResult] =
    await Promise.all([
      getSiteOfCampground(params.siteId),
      getAmenitiesForSite(params.siteId),
      getAllAmenities(),
    ]);

  if (
    !siteResult.success ||
    !currentAmenitiesResult.success ||
    !allAmenitiesResult.success
  ) {
    redirect(routes.platformAdmin.campgroundSites(params.id));
  }

  const site = siteResult.data!;
  const currentAmenities = currentAmenitiesResult.data!;
  const allAmenities = allAmenitiesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={`Manage ${site.name}'s amenities`}
        description={`Site: ${site.description}`}
        backTo={routes.platformAdmin.campgroundSiteView(
          params.id,
          params.siteId,
        )}
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
        <SiteAmenitiesClient
          campgroundId={params.id}
          siteId={params.siteId}
          allAmenities={allAmenities}
          currentAmenities={currentAmenities}
        />
      </Suspense>
    </div>
  );
}
