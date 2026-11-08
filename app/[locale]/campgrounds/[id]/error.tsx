"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function CampgroundDetailError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tc = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <AlertCircle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-3xl font-bold tracking-tight mb-4">
        {tc("somethingWentWrong")}
      </h1>
      <p className="text-lg text-muted-foreground max-w-md mb-8">
        {tc("error")}
      </p>
    </div>
  );
}
