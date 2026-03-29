"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { useTranslations } from "next-intl";

type ErrorAlertProps = {
  title?: string;
  errorMsg?: string | null;
};

export function ErrorAlert({ title, errorMsg }: ErrorAlertProps) {
  const tc = useTranslations("common");

  if (!errorMsg) {
    return null;
  }
  if (!title) {
    title = tc("error");
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMsg}</AlertDescription>
    </Alert>
  );
}
