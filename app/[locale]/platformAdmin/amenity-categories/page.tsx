import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllAmenityCategories } from "@/data/amenities-categories/get-amenities-categories";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AmenityCategoriesClient from "./AmenityCategoriesClient";

const NAMESPACE = "AdminAmenityCategoryPage" as const;

export const generateMetadata = () => generatePageMetadata(NAMESPACE);

export default async function AmenityCategoriesAdminPage() {
  const t = await getTranslations(NAMESPACE);

  const initialCategoriesResult = await getAllAmenityCategories();

  if (!initialCategoriesResult.success) {
    redirect(routes.platformAdmin.root());
  }

  const initialCategories = initialCategoriesResult.data!;

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
