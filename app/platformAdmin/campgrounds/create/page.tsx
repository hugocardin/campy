import { getOwners } from "@/app/data/profile/get-owners";
import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CampgroundCreateClient from "./CampgroundCreateClient";

export const metadata = {
  title: "Admin - Create Campground",
  description: "Create a new campground",
};

export default async function CampgroundCreatePage() {
  const owners = await getOwners();

  if (!owners) {
    redirect(routes.platformAdmin.campgrounds());
  }

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={`Create new campground`}
        description=""
        backTo={routes.platformAdmin.campgrounds()}
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-50 w-full" />
          </div>
        }
      >
        <CampgroundCreateClient owners={owners} />
      </Suspense>
    </div>
  );
}
