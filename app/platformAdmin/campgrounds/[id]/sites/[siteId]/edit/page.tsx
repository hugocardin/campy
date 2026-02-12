import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteOfCampground } from "@/data/campgrounds/get-campground-sites";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { getAllSiteTypes } from "@/data/site-types/get-site-types";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SiteEditClient from "./SiteEditClient";

export const metadata = {
  title: "Admin - Campground's site details",
  description: "Manage a campground's site details",
};

export default async function SiteEditPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; siteId: string }>;
}) {
  const params = await paramsPromise;

  const [campgroundresult, siteResult, siteTypesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getSiteOfCampground(params.siteId),
    getAllSiteTypes(),
  ]);

  if (
    !campgroundresult.success ||
    !siteResult.success ||
    !siteTypesResult.success
  ) {
    redirect(routes.platformAdmin.campgroundSites(params.id));
  }

  const campground = campgroundresult.data!;
  const site = siteResult.data!;
  const siteTypes = siteTypesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={`Edit ${campground.name} details`}
        description={`Owner: ${campground.owner_full_name} · ${campground.owner_email}`}
        backTo={routes.platformAdmin.campgroundSites(campground.id)}
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
        <SiteEditClient
          campground={campground}
          site={site}
          siteTypes={siteTypes}
        />
      </Suspense>
    </div>
  );
}
