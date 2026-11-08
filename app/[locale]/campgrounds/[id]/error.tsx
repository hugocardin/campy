"use client";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useTransition } from "react";

export default function CampgroundDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("campgrounds.CampgroundDetailsPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <AlertCircle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-3xl font-bold tracking-tight mb-4">
        {t("loadErrorTitle")}
      </h1>
      <p className="text-lg text-muted-foreground max-w-md mb-8">
        {t("loadErrorDescription")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(() => {
              router.refresh();
              reset();
            });
          }}
        >
          {t("loadErrorRetry")}
        </Button>
        <Button variant="outline" asChild>
          <Link href={routes.home()}>{t("loadErrorBackHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
