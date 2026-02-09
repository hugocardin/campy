import { BackHeader } from "@/components/layout/back-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCampgroundsAdmin } from "@/data/campgrounds/get-campgrounds-admin";
import { routes } from "@/lib/routes";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import CampgroundsClient from "./CampgroundsClient";

export const metadata = {
  title: "Admin - Amenity Categories",
  description: "Manage amenity categories for campgrounds",
};

export default async function CampgroundsAdminPage() {
  const campgroundsresult = await getCampgroundsAdmin();

  if (!campgroundsresult.success) {
    redirect(routes.platformAdmin.root());
  }

  const campgrounds = campgroundsresult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title="Campgrounds list"
        description="List all campgrounds."
        backTo={routes.platformAdmin.root()}
        rightContent={
          <Button asChild size="lg">
            <Link href={routes.platformAdmin.campgroundCreate()}>
              <Plus className="mr-2 h-4 w-4" />
              Create Campground
            </Link>
          </Button>
        }
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
        <CampgroundsClient campgrounds={campgrounds} />
      </Suspense>
    </div>
  );
}
