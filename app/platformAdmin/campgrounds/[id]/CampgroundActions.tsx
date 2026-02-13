"use client";

import { ListChecks, Pencil, Power, PowerOff, Tent } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  activateCampgroundAction,
  inactivateCampgroundAction,
} from "@/app/actions/campgrounds-admin";
import { Button } from "@/components/ui/button";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { routes } from "@/lib/routes";
import Link from "next/link";

type CampgroundActionsProps = {
  campground: CampgroundAdmin;
};

export function CampgroundActions({ campground }: CampgroundActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggleStatus = () => {
    const action = campground.active
      ? inactivateCampgroundAction
      : activateCampgroundAction;
    const actionName = campground.active ? "deactivate" : "activate";
    const confirmMessage = `Are you sure you want to ${actionName} "${campground.name}"?`;

    if (!confirm(confirmMessage)) return;

    setError(null);

    startTransition(async () => {
      const result = await action(campground.id);
      if (!result.success) {
        setError(result.error.message);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <Button
          variant={campground.active ? "outline-danger" : "outline-success"}
          onClick={handleToggleStatus}
          disabled={isPending}
        >
          {campground.active ? (
            <>
              <PowerOff className="mr-2 h-4 w-4" />
              Deactivate
            </>
          ) : (
            <>
              <Power className="mr-2 h-4 w-4" />
              Activate
            </>
          )}
        </Button>

        <Button asChild variant="outline">
          <Link href={routes.platformAdmin.campgroundAmenities(campground.id)}>
            <ListChecks className="mr-2 h-4 w-4" />
            Manage amenities
          </Link>
        </Button>

        <Button asChild variant="outline">
          <Link href={routes.platformAdmin.campgroundSites(campground.id)}>
            <Tent className="mr-2 h-4 w-4" />
            Manage sites
          </Link>
        </Button>

        <Button asChild variant="outline">
          <Link href={routes.platformAdmin.campgroundEdit(campground.id)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive text-right md:text-left max-w-75 md:max-w-none">
          {error}
        </div>
      )}
    </div>
  );
}
