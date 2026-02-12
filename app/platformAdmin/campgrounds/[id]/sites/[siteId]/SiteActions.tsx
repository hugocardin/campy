"use client";

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import Link from "next/link";

type SiteActionsProps = {
  campgroundId: string;
  siteId: string;
};

export function SiteActions({ campgroundId, siteId }: SiteActionsProps) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <Link
            href={routes.platformAdmin.campgroundSiteAmenities(
              campgroundId,
              siteId,
            )}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Manage amenities
          </Link>
        </Button>

        <Button asChild variant="outline">
          <Link
            href={routes.platformAdmin.campgroundSiteEdit(campgroundId, siteId)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>
    </div>
  );
}
