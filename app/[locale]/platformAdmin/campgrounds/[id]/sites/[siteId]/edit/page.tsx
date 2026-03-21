import { updateSiteAction } from "@/app/actions/site-admin.ts";
import { BackHeader } from "@/components/layout/back-header";
import SiteFormClient from "@/components/site/SiteFormClient";
import { toSiteFormData } from "@/components/site/site-form-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteOfCampground } from "@/data/campgrounds/get-campground-sites";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { getAllSiteTypes } from "@/data/site-types/get-site-types";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

const NAMESPACE = "AdminSiteEditPage" as const;

export const generateMetadata = () => generatePageMetadata(NAMESPACE);

export default async function SiteEditPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; siteId: string }>;
}) {
  const t = await getTranslations(NAMESPACE);

  const params = await paramsPromise;

  const [campgroundresult, siteResult, siteTypesResult] = await Promise.all([
    getCampgroundAdminById(params.id),
    getSiteOfCampground(params.siteId),
    getAllSiteTypes(),
  ]);

  if (
    !campgroundresult.success ||
    !siteResult.success ||
    !siteTypesResult.success
  ) {
    redirect(routes.platformAdmin.campgroundSites(params.id));
  }

  const campground = campgroundresult.data!;
  const site = siteResult.data!;
  const siteTypes = siteTypesResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title", { name: site.name })}
        description={t("pageHeader.description", {
          description: site.description,
        })}
        backTo={routes.platformAdmin.campgroundSiteView(campground.id, site.id)}
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
        <SiteFormClient
          campgroundId={campground.id}
          siteTypes={siteTypes}
          initialData={toSiteFormData(site)}
          onSubmit={updateSiteAction}
          tNamespace={NAMESPACE}
        />
      </Suspense>
    </div>
  );
}
