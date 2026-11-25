import { updateCampgroundAction } from "@/app/actions/campgrounds-admin";
import { toCampgroundFormData } from "@/components/campground/campground-form-utils";
import CampgroundFormClient from "@/components/campground/CampgroundFormClient";
import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampgroundCurrencyLockReason } from "@/data/campgrounds/get-campground-currency-lock";
import { getCampgroundAdminById } from "@/data/campgrounds/get-campgrounds-admin";
import { getAllCommissionTypes } from "@/data/commission-types/get-commission-types";
import { getOwners } from "@/data/profile/get-owners";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

const PAGE_NAMESPACE = "campgrounds.AdminCampgroundEditPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function CampgroundEditPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations(PAGE_NAMESPACE);

  const params = await paramsPromise;

  const [campgroundresult, ownersResult, lockResult, commissionTypesResult] =
    await Promise.all([
      getCampgroundAdminById(params.id),
      getOwners(),
      getCampgroundCurrencyLockReason(params.id),
      getAllCommissionTypes(),
    ]);

  if (
    !campgroundresult.success ||
    !ownersResult.success ||
    !commissionTypesResult.success
  ) {
    redirect(routes.platformAdmin.campgrounds());
  }

  const campground = campgroundresult.data!;
  const owners = ownersResult.data!;
  const commissionTypes = commissionTypesResult.data!;
  // Fail closed on probe error with neutral "unknown" (not a false "sites").
  const currencyLockReason = lockResult.success
    ? lockResult.data
    : ("unknown" as const);

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title", { name: campground.name })}
        description={t("pageHeader.description", {
          ownerName: campground.owner_full_name,
          ownerEmail: campground.owner_email,
        })}
        backTo={routes.platformAdmin.campgroundView(campground.id)}
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
        <CampgroundFormClient
          owners={owners}
          commissionTypes={commissionTypes}
          onSubmit={updateCampgroundAction}
          initialData={toCampgroundFormData(campground)}
          currencyLockReason={currencyLockReason}
        />
      </Suspense>
    </div>
  );
}
