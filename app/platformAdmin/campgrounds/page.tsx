import { getCampgroundsAdmin } from "@/app/data/campgrounds/get-campgrounds-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import CampgroundsClient from "./CampgroundsClient";

export const metadata = {
  title: "Admin - Amenity Categories",
  description: "Manage amenity categories for campgrounds",
};

export default async function CampgroundsAdminPage() {
  const campgrounds = await getCampgroundsAdmin();

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
        <CampgroundsClient campgrounds={campgrounds} />
      </Suspense>
    </div>
  );
}
