import { Leaf, Tags, Tent } from "lucide-react";

import { routes } from "@/lib/routes";
import { useTranslations } from "next-intl";
import { DashboardCard } from "./DashboardCard";

export function DashboardCards() {
  const t = useTranslations("AdminDashboardPage");
  const t_amenityCategory = useTranslations("entities.amenityCategory");
  const t_amenity = useTranslations("entities.amenity");
  const t_campground = useTranslations("entities.campground");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <DashboardCard
        href={routes.platformAdmin.campgrounds()}
        icon={Tent}
        title={t_campground("campgrounds")}
        description={t("amenitiesDescription")}
      />

      <DashboardCard
        href={routes.platformAdmin.amenityCategory()}
        icon={Tags}
        title={t_amenityCategory("amenityCategories")}
        description={t("amenityCategoriesDescription")}
      />

      <DashboardCard
        href={routes.platformAdmin.amenities()}
        icon={Leaf}
        title={t_amenity("amenities")}
        description={t("campgroundDescription")}
      />
    </div>
  );
}
