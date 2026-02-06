import { getAllAmenityCategories } from "@/app/data/amenities-categories/get-amenities-categories";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import AmenityCategoriesClient from "./AmenityCategoriesClient";
import { BackHeader } from "@/components/layout/back-header";
import { routes } from "@/lib/routes";

export const metadata = {
  title: "Admin - Amenity Categories",
  description: "Manage amenity categories for campgrounds",
};

export default async function AmenityCategoriesAdminPage() {
  const initialCategories = await getAllAmenityCategories();

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title="Manage Amenity Categories"
        description="Create and manage categories that group your amenities"
        backTo={routes.platformAdmin.root()}
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
        <AmenityCategoriesClient initialCategories={initialCategories} />
      </Suspense>
    </div>
  );
}
