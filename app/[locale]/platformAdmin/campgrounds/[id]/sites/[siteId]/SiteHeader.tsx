"use client";

import { BackHeader } from "@/components/layout/back-header";
import { Site } from "@/entities/sites";
import { routes } from "@/lib/routes";
import { SiteActions } from "./SiteActions";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { useTranslations } from "next-intl";

type SiteHeaderProps = {
  site: Site;
  campground: CampgroundAdmin;
};

export function SiteHeader({ site, campground }: SiteHeaderProps) {
  const t = useTranslations("AdminSiteDetailsPage");

  return (
    <BackHeader
      title={t("pageHeader.title", { name: site.name })}
      description={t("pageHeader.description", {
        name: campground.name,
      })}
      backTo={routes.platformAdmin.campgroundSites(campground.id)}
      rightContent={
        <SiteActions siteId={site.id} campgroundId={campground.id} />
      }
    />
  );
}
