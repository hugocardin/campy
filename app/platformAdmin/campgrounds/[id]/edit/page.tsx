import { getCampgroundAdminById } from "@/app/data/campgrounds/get-campgrounds-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import CampgroundEditClient from "./CampgroundEditClient";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";

export const metadata = {
  title: "Admin - Campground details",
  description: "Manage a campground's details",
};

export default async function CampgroundEditPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsPromise;
  const campground = await getCampgroundAdminById(params.id);

  if (!campground) {
    redirect(routes.platformAdmin.campgrounds());
  }

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={`Edit ${campground.name} details`}
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
        <CampgroundEditClient campground={campground} />
      </Suspense>
    </div>
  );
}
