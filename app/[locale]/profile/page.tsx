import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserProfile } from "@/data/profile/get-profile";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

const PAGE_NAMESPACE = "profile.ProfilePage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function ProfilePage() {
  const t = await getTranslations(PAGE_NAMESPACE);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(routes.auth());
  }

  const profileResult = await getUserProfile(user.id);

  if (!profileResult.success) {
    redirect(routes.auth());
  }

  const profile = profileResult.data!;

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
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
        <ProfileClient profile={profile} user={user} />
      </Suspense>
    </div>
  );
}
