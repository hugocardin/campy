import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSitesOfCampground } from "@/data/campgrounds/get-campground-sites";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SitesClient from "./SitesClient";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Admin - Campground's sites",
  description: "Manage a campground's sites",
};

export default async function CampgroundEditPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;

  const [campgroundresult, sitesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getSitesOfCampground(params.id),
  ]);

  if (!campgroundresult.success || !sitesResult.success) {
    redirect(routes.platformAdmin.campgroundView(params.id));
  }

  const campground = campgroundresult.data!;
  const sites = sitesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={`Manage ${campground.name} sites`}
        description={`Owner: ${campground.owner_full_name} · ${campground.owner_email}`}
        backTo={routes.platformAdmin.campgroundView(campground.id)}
        rightContent={
          <Button asChild size="lg">
            <Link
              href={routes.platformAdmin.campgroundSiteCreate(campground.id)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Site
            </Link>
          </Button>
        }
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
        <SitesClient campground={campground} sites={sites} />
      </Suspense>
    </div>
  );
}
