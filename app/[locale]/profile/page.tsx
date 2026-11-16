import { BackHeader } from "@/components/layout/back-header";
import { requireCurrentProfile } from "@/data/profile/require-current-profile";
import { generatePageMetadata } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import ProfileClient from "./ProfileClient";

const PAGE_NAMESPACE = "profile.ProfilePage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

export default async function ProfilePage() {
  const t = await getTranslations(PAGE_NAMESPACE);
  const { user, profile } = await requireCurrentProfile();

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BackHeader
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
      />

      <ProfileClient profile={profile} user={user} />
    </div>
  );
}
