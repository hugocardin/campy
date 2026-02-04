import { getCampgroundAdminById } from "@/app/data/campgrounds/get-campgrounds-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import CampgroundClient from "./CampgroundClient";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin - Campground details",
  description: "Manage a campground's details",
};

export default async function CampgroundDetailPage({
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
        <CampgroundClient campground={campground} />
      </Suspense>
    </div>
  );
}
