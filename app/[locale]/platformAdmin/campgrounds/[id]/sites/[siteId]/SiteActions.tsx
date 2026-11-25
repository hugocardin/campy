"use client";

import { deleteSiteAction } from "@/app/actions/site-admin";
import { EditButton } from "@/components/buttons/EditButton";
import { ManageAmenitiesButton } from "@/components/buttons/ManageAmenitiesButton";
import { DeleteButtonWithConfirmation } from "@/components/dialogs/DeleteButtonWithConfirmation";
import { translateErrorCode, withErrorReference } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type SiteActionsProps = {
  campgroundId: string;
  siteId: string;
  siteName: string;
};

export function SiteActions({
  campgroundId,
  siteId,
  siteName,
}: SiteActionsProps) {
  const tc = useTranslations("common");
  const t_errors = useTranslations("errors");
  const t_sites = useTranslations("sites");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteSiteAction(campgroundId, siteId);
      if (!result.success) {
        setError(
          withErrorReference(
            translateErrorCode(
              result.errorCode,
              t_errors,
              tc("error"),
              result.details,
            ),
            result.details,
            (errorId) => tc("errorReference", { errorId }),
          ),
        );
        return;
      }
      router.push(routes.platformAdmin.campgroundSites(campgroundId));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <DeleteButtonWithConfirmation
          disabled={isPending}
          title={t_sites("actions.deleteSiteTitle")}
          description={t_sites("actions.deleteSiteDescription", {
            name: siteName,
          })}
          onConfirm={handleDelete}
        />

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

      {error && (
        <div className="text-sm text-destructive text-right md:text-left max-w-75 md:max-w-none whitespace-pre-line">
          {error}
        </div>
      )}
    </div>
  );
}
