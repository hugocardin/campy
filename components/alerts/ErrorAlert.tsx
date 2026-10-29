"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { useTranslations } from "next-intl";

type ErrorAlertProps = {
  title?: string;
  errorMsg?: string | null;
  /** Optional support correlation id (also fine if already appended into errorMsg). */
  errorId?: string | null;
};

export function ErrorAlert({ title, errorMsg, errorId }: ErrorAlertProps) {
  const tc = useTranslations("common");

  if (!errorMsg) {
    return null;
  }
  if (!title) {
    title = tc("error");
  }

  const referenceAlreadyInMsg =
    !!errorId && errorMsg.includes(errorId);

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">
        {errorMsg}
        {errorId && !referenceAlreadyInMsg ? (
          <>
            {"\n"}
            {tc("errorReference", { errorId })}
          </>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
