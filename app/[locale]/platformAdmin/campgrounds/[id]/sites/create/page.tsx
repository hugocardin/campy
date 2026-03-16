import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { getAllSiteTypes } from "@/data/site-types/get-site-types";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SiteCreateClient from "./SiteCreateClient";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

const NAMESPACE = "AdminCampgroundSiteCreatePage" as const;

export const generateMetadata = () => generatePageMetadata(NAMESPACE);

export default async function SiteCreatePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations(NAMESPACE);

  const params = await paramsPromise;

  const [campgroundresult, siteTypesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getAllSiteTypes(),
  ]);

  if (!campgroundresult.success || !siteTypesResult.success) {
    redirect(routes.platformAdmin.campgroundSites(params.id));
  }

  const campground = campgroundresult.data!;
  const siteTypes = siteTypesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title", { name: campground.name })}
        description={t("pageHeader.description", {
          ownerName: campground.owner_full_name,
          ownerEmail: campground.owner_email,
        })}
        backTo={routes.platformAdmin.campgroundSites(campground.id)}
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
        <SiteCreateClient campground={campground} siteTypes={siteTypes} />
      </Suspense>
    </div>
  );
}
