import { updateProfileAction } from "@/app/actions/profile";
import ProfileFormClient from "@/components/profile/ProfileFormClient";
import { BackHeader } from "@/components/layout/back-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserProfile } from "@/data/profile/get-profile";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

const PAGE_NAMESPACE = "profile.ProfileEditPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function ProfileEditPage() {
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
        backTo={routes.profile()}
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
        <ProfileFormClient profile={profile} onSubmit={updateProfileAction} />
      </Suspense>
    </div>
  );
}
