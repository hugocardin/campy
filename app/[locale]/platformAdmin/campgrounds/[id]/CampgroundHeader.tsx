"use client";

import { CampgroundAdmin } from "@/entities/campground-admin";
import { BackHeader } from "@/components/layout/back-header";
import { Badge } from "@/components/ui/badge";
import { CampgroundActions } from "./CampgroundActions";
import { routes } from "@/lib/routes";

type CampgroundHeaderProps = {
  campground: CampgroundAdmin;
};

export function CampgroundHeader({ campground }: CampgroundHeaderProps) {
  return (
    <BackHeader
      title={campground.name}
      description={`Owner: ${campground.owner_full_name} · ${campground.owner_email}`}
      backTo={routes.platformAdmin.campgrounds()}
      leftContent={
        <div className="flex items-center gap-4 flex-wrap">
          {campground.active ? (
            <Badge className="bg-primary-soft text-primary border-primary-border px-3 py-1 text-base font-medium">
              Active
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700/50 px-3 py-1 text-base font-medium">
              Inactive
            </Badge>
          )}
        </div>
      }
      rightContent={<CampgroundActions campground={campground} />}
    />
  );
}
