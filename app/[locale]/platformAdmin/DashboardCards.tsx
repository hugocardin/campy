import { Leaf, MapPinned, Tags, Tent } from "lucide-react";

import { routes } from "@/lib/routes";
import { useTranslations } from "next-intl";
import { DashboardCard } from "./DashboardCard";

export function DashboardCards() {
  const t_adminDashboard = useTranslations("adminDashboard");
  const t_amenityCategories = useTranslations("amenityCategories");
  const t_amenities = useTranslations("amenities");
  const t_campgrounds = useTranslations("campgrounds");
  const t_siteTypes = useTranslations("siteTypes");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <DashboardCard
        href={routes.platformAdmin.campgrounds()}
        icon={Tent}
        title={t_campgrounds("plural")}
        description={t_adminDashboard("amenitiesDescription")}
      />

      <DashboardCard
        href={routes.platformAdmin.amenityCategory()}
        icon={Tags}
        title={t_amenityCategories("plural")}
        description={t_adminDashboard("amenityCategoriesDescription")}
      />

      <DashboardCard
        href={routes.platformAdmin.amenities()}
        icon={Leaf}
        title={t_amenities("plural")}
        description={t_adminDashboard("campgroundDescription")}
      />

      <DashboardCard
        href={routes.platformAdmin.siteTypes()}
        icon={MapPinned}
        title={t_siteTypes("plural")}
        description={t_adminDashboard("siteTypesDescription")}
      />
    </div>
  );
}
