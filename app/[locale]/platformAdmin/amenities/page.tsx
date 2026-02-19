import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllAmenityCategories } from "@/data/amenities-categories/get-amenities-categories";
import { getAllAmenities } from "@/data/amenities/get-amenities";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AmenitiesClient from "./AmenitiesClient";

const NAMESPACE = "AdminAmenitiesPage" as const;

export const generateMetadata = () => generatePageMetadata(NAMESPACE);

export default async function AmenitiesAdminPage() {
  const t = await getTranslations(NAMESPACE);

  const [amenitiesResult, categoriesResult] = await Promise.all([
    getAllAmenities(),
    getAllAmenityCategories(),
  ]);

  if (!amenitiesResult.success || !categoriesResult.success) {
    redirect(routes.platformAdmin.root());
  }

  const amenities = amenitiesResult.data!;
  const categories = categoriesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("title")}
        description={t("description")}
        backTo={routes.platformAdmin.root()}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-75 w-full" />
          </div>
        }
      >
        <AmenitiesClient amenities={amenities} categories={categories} />
      </Suspense>
    </div>
  );
}
