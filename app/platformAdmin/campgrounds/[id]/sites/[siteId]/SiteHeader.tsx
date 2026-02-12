"use client";

import { BackHeader } from "@/components/layout/back-header";
import { Site } from "@/entities/sites";
import { routes } from "@/lib/routes";
import { SiteActions } from "./SiteActions";
import { CampgroundAdmin } from "@/entities/campground-admin";

type SiteHeaderProps = {
  site: Site;
  campground: CampgroundAdmin;
};

export function SiteHeader({ site, campground }: SiteHeaderProps) {
  return (
    <BackHeader
      title={`Site: ${site.name}`}
      description={`From campground : ${campground.name}`}
      backTo={routes.platformAdmin.campgroundSites(campground.id)}
      rightContent={
        <SiteActions siteId={site.id} campgroundId={campground.id} />
      }
    />
  );
}
