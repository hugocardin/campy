import { updateProfileAction } from "@/app/actions/profile";
import { BackHeader } from "@/components/layout/back-header";
import ProfileFormClient from "@/components/profile/ProfileFormClient";
import { requireCurrentProfile } from "@/data/profile/require-current-profile";
import { routes } from "@/lib/routes";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

const PAGE_NAMESPACE = "profile.ProfileEditPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function ProfileEditPage() {
  const t = await getTranslations(PAGE_NAMESPACE);
  const { profile } = await requireCurrentProfile();

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
        backTo={routes.profile()}
      />

      <ProfileFormClient profile={profile} onSubmit={updateProfileAction} />
    </div>
  );
}
