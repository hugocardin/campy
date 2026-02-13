import { Skeleton } from "@/components/ui/skeleton";
import { getSiteOfCampground } from "@/data/campgrounds/get-campground-sites";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { getAmenitiesForSite } from "@/data/sites/get-site-amenities";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "./SiteHeader";
import SiteViewClient from "./SiteViewClient";

export const metadata = {
  title: "Admin - Campground's site details",
  description: "Manage a campground's site details",
};

export default async function SiteViewPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; siteId: string }>;
}) {
  const params = await paramsPromise;

  const [campgroundresult, siteResult, amenitiesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getSiteOfCampground(params.siteId),
    getAmenitiesForSite(params.siteId),
  ]);

  if (
    !campgroundresult.success ||
    !siteResult.success ||
    !amenitiesResult.success
  ) {
    redirect(routes.platformAdmin.campgroundSiteView(params.id, params.siteId));
  }

  const campground = campgroundresult.data!;
  const site = siteResult.data!;
  const amenities = amenitiesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <SiteHeader campground={campground} site={site}></SiteHeader>

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
        <SiteViewClient
          campground={campground}
          site={site}
          amenities={amenities}
        />
      </Suspense>
    </div>
  );
}
