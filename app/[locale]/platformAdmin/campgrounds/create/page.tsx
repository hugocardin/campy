import { createCampgroundAction } from "@/app/actions/campgrounds-admin";
import CampgroundFormClient from "@/components/campground/CampgroundFormClient";
import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getOwners } from "@/data/profile/get-owners";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

const PAGE_NAMESPACE = "campgrounds.AdminCampgroundCreatePage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function CampgroundCreatePage() {
  const t = await getTranslations(PAGE_NAMESPACE);

  const ownersresult = await getOwners();

  if (!ownersresult.success) {
    redirect(routes.platformAdmin.campgrounds());
  }

  const owners = ownersresult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
        backTo={routes.platformAdmin.campgrounds()}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-50 w-full" />
          </div>
        }
      >
        <CampgroundFormClient
          owners={owners}
          onSubmit={createCampgroundAction}
        />
      </Suspense>
    </div>
  );
}
