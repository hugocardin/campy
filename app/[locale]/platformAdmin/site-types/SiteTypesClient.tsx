"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createSiteTypeAction,
  deleteSiteTypeAction,
} from "@/app/actions/site-types";
import { ErrorAlert } from "@/components/alerts/ErrorAlert";
import { DeleteButtonWithConfirmation } from "@/components/dialogs/DeleteButtonWithConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SiteType } from "@/entities/site-type";
import {
  SiteTypeMissingField,
  translateErrorCode,
  withErrorReference,
} from "@/lib/errors";
import {
  isProtectedSiteTypeCode,
  SITE_TYPE_CODE_MAX_LENGTH,
} from "@/lib/site-types/code";
import { useTranslations } from "next-intl";

type Props = {
  initialSiteTypes: SiteType[];
};

export default function SiteTypesClient({ initialSiteTypes }: Props) {
  const tc = useTranslations("common");
  const t_siteTypes = useTranslations("siteTypes");
  const t_errors = useTranslations("errors");

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const siteTypeFieldMessages = {
    [SiteTypeMissingField.code]: t_siteTypes("errors.codeRequired"),
  };
  const siteTypeFieldTooLongMessages = {
    [SiteTypeMissingField.code]: t_siteTypes("errors.codeTooLong", {
      max: SITE_TYPE_CODE_MAX_LENGTH,
    }),
  };

  const showActionError = (
    errorCode: string | undefined,
    details: Record<string, unknown> | undefined,
  ) => {
    const message =
      details?.reason === "site_type_code_protected"
        ? t_siteTypes("errors.systemCodeProtected")
        : translateErrorCode(errorCode, t_errors, tc("error"), details, {
            fieldMessages: siteTypeFieldMessages,
            fieldTooLongMessages: siteTypeFieldTooLongMessages,
          });
    setError(
      withErrorReference(message, details, (errorId) =>
        tc("errorReference", { errorId }),
      ),
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setSubmitting(true);
    setError(null);

    const result = await createSiteTypeAction({ code: code.trim() });

    if (!result.success) {
      showActionError(result.errorCode, result.details);
    } else {
      setCode("");
      router.refresh();
    }

    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    setSubmitting(true);
    setError(null);

    const result = await deleteSiteTypeAction(id);

    if (!result.success) {
      showActionError(result.errorCode, result.details);
    } else {
      router.refresh();
    }

    setSubmitting(false);
  };

  return (
    <div className="space-y-8">
      <ErrorAlert errorMsg={error}></ErrorAlert>

      <form onSubmit={handleCreate} className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label htmlFor="site-type-code">
            {t_siteTypes("form.codeLabel")}
          </Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              id="site-type-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t_siteTypes("form.createCodePlaceholder")}
              maxLength={SITE_TYPE_CODE_MAX_LENGTH}
              disabled={submitting}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={submitting || !code.trim()}>
              {submitting ? tc("processing") : tc("add")}
            </Button>
          </div>
        </div>
      </form>

      {initialSiteTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-lg font-medium">
            {t_siteTypes("noResult")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t_siteTypes("singular")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialSiteTypes.map((siteType) => (
                <TableRow key={siteType.id}>
                  <TableCell className="font-medium">{siteType.code}</TableCell>
                  <TableCell className="text-right">
                    <DeleteButtonWithConfirmation
                      title={t_siteTypes("actions.deleteSiteTypeTitle")}
                      description={
                        isProtectedSiteTypeCode(siteType.code)
                          ? t_siteTypes("errors.systemCodeProtected")
                          : t_siteTypes("actions.confirmSiteTypeDeletion", {
                              code: siteType.code,
                            })
                      }
                      onConfirm={() => handleDelete(siteType.id)}
                      disabled={
                        submitting || isProtectedSiteTypeCode(siteType.code)
                      }
                    ></DeleteButtonWithConfirmation>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
