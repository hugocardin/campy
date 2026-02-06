import { Leaf, Tags, Tent } from "lucide-react";

import { routes } from "@/lib/routes";
import { DashboardCard } from "./DashboardCard";

export function DashboardCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <DashboardCard
        href={routes.platformAdmin.amenities()}
        icon={Leaf}
        title="Amenities"
        description="Manage the list of available amenities"
      />

      <DashboardCard
        href={routes.platformAdmin.amenityCategory()}
        icon={Tags}
        title="Amenity Categories"
        description="Organize amenities into groups (Services, Facilities, etc.)"
      />

      <DashboardCard
        href={routes.platformAdmin.campgrounds()}
        icon={Tent}
        title="Campgrounds"
        description="Organize campgrounds"
      />
    </div>
  );
}
