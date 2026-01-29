import { getAllAmenities } from "@/data/amenities/get-amenities";
import { getAllAmenityCategories } from "@/data/amenities-categories/get-amenities-categories";
import { Suspense } from "react";
import AmenitiesClient from "./AmenitiesClient";

export const metadata = {
  title: "Admin - Amenities",
  description: "Manage amenities",
};

export default async function AmenitiesAdminPage() {
  // Fetch both on server — parallel if possible
  const [amenities, categories] = await Promise.all([
    getAllAmenities(),
    getAllAmenityCategories(),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-foreground">
        Manage Amenities
      </h1>

      <Suspense
        fallback={<div className="py-12 text-center">Loading amenities...</div>}
      >
        <AmenitiesClient amenities={amenities} categories={categories} />
      </Suspense>
    </div>
  );
}
