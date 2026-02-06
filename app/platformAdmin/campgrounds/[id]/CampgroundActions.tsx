"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  activateCampgroundAction,
  inactivateCampgroundAction,
} from "@/app/actions/campgrounds-admin";
import { CampgroundAdmin } from "@/app/entities/campground-admin";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
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
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={handleToggleStatus}
          disabled={isPending}
          className={cn(
            "min-w-37.5 transition-colors",
            campground.active
              ? "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-red-600/60 dark:hover:bg-red-950/40"
              : "border-primary text-primary hover:bg-primary-soft hover:text-primary dark:border-primary/70 dark:hover:bg-primary-muted dark:text-primary dark:hover:text-primary-foreground",
          )}
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
          <Link
            href={routes.platformAdmin.campgroundDetailsEdit(campground.id)}
          >
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
