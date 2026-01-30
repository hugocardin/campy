import { getAllAmenityCategories } from "@/app/data/amenities-categories/get-amenities-categories";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import AmenityCategoriesClient from "./AmenityCategoriesClient";

export const metadata = {
  title: "Admin - Amenity Categories",
  description: "Manage amenity categories for campgrounds",
};

export default async function AmenityCategoriesAdminPage() {
  const initialCategories = await getAllAmenityCategories();

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Manage Amenity Categories
        </h1>
        <p className="mt-2 text-muted-foreground">
          Create and manage categories that group your amenities
        </p>
      </div>

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
