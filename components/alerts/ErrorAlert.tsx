"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

type ErrorAlertProps = {
  title?: string;
  errorMsg?: string | null;
};

export function ErrorAlert({ title = "Error", errorMsg }: ErrorAlertProps) {
  if (!errorMsg) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMsg}</AlertDescription>
    </Alert>
  );
}
