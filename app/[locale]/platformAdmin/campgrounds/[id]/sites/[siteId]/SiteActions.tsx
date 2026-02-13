"use client";

import { EditButton } from "@/components/buttons/EditButton";
import { ManageAmenitiesButton } from "@/components/buttons/ManageAmenitiesButton";
import { routes } from "@/lib/routes";

type SiteActionsProps = {
  campgroundId: string;
  siteId: string;
};

export function SiteActions({ campgroundId, siteId }: SiteActionsProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <ManageAmenitiesButton
          href={routes.platformAdmin.campgroundSiteAmenities(
            campgroundId,
            siteId,
          )}
        ></ManageAmenitiesButton>

        <EditButton
          href={routes.platformAdmin.campgroundSiteEdit(campgroundId, siteId)}
        ></EditButton>
      </div>
    </div>
  );
}
