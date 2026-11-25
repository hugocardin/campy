import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllSiteTypes } from "@/data/site-types/get-site-types";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SiteTypesClient from "./SiteTypesClient";

const PAGE_NAMESPACE = "siteTypes.AdminSiteTypesPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function SiteTypesAdminPage() {
  const t = await getTranslations(PAGE_NAMESPACE);

  const initialSiteTypesResult = await getAllSiteTypes();

  if (!initialSiteTypesResult.success) {
    redirect(routes.platformAdmin.root());
  }

  const initialSiteTypes = initialSiteTypesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
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
        <SiteTypesClient initialSiteTypes={initialSiteTypes} />
      </Suspense>
    </div>
  );
}
