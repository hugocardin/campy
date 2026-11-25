"use client";

import { sweepOrphanParkMediaAction } from "@/app/actions/park-media";
import { Button } from "@/components/ui/button";
import { translateErrorCode, withErrorReference } from "@/lib/errors";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Manual orphan sweep for park-media (#57). No cron yet — platform admin only.
 */
export function ParkMediaSweepCard() {
  const tc = useTranslations("common");
  const t_errors = useTranslations("errors");
  const t = useTranslations("adminDashboard.parkMediaSweep");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const handleSweep = () => {
    if (!confirm(t("confirm"))) return;
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await sweepOrphanParkMediaAction();
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
      setSummary(
        t("result", {
          scanned: result.data.scanned,
          removed: result.data.removed,
          failed: result.data.failed,
        }),
      );
    });
  };

  return (
    <div className="mt-10 max-w-xl space-y-3 border-t pt-8">
      <h2 className="text-lg font-medium">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={handleSweep}
      >
        {isPending ? t("running") : t("run")}
      </Button>
      {summary && (
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {summary}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
      )}
    </div>
  );
}
