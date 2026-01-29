import { getAllAmenityCategories } from "@/data/amenities-categories/get-amenities-categories";

import { Suspense } from "react";
import AmenityCategoriesClient from "./AmenityCategoriesClient";

export const metadata = {
  title: "Admin - Amenity Categories",
  description: "Manage amenity categories",
};

export default async function AmenityCategoriesAdminPage() {
  const initialCategories = await getAllAmenityCategories();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-foreground">
        Manage Amenity Categories
      </h1>

      <Suspense
        fallback={
          <div className="py-12 text-center">Loading categories...</div>
        }
      >
        <AmenityCategoriesClient initialCategories={initialCategories} />
      </Suspense>
    </div>
  );
}
