"use client";

import { BackHeader } from "@/components/layout/back-header";
import { Badge } from "@/components/ui/badge";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { routes } from "@/lib/routes";
import { useTranslations } from "next-intl";
import { CampgroundActions } from "./CampgroundActions";

type CampgroundHeaderProps = {
  campground: CampgroundAdmin;
};

export function CampgroundHeader({ campground }: CampgroundHeaderProps) {
  const t = useTranslations("AdminCampgroundDetailsPage");

  return (
    <BackHeader
      title={t("pageHeader.title", { name: campground.name })}
      description={t("pageHeader.description", {
        ownerName: campground.owner_full_name,
        ownerEmail: campground.owner_email,
      })}
      backTo={routes.platformAdmin.campgrounds()}
      leftContent={
        <div className="flex items-center gap-4 flex-wrap">
          {campground.active ? (
            <Badge className="bg-primary-soft text-primary border-primary-border px-3 py-1 text-base font-medium">
              {t("active")}
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700/50 px-3 py-1 text-base font-medium">
              {t("inactive")}
            </Badge>
          )}
        </div>
      }
      rightContent={<CampgroundActions campground={campground} />}
    />
  );
}
