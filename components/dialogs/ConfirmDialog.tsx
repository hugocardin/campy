// components/ui/ConfirmDialog.tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";
import { ReactNode } from "react";

type ConfirmDialogProps = {
  children: ReactNode; // ← the DeleteButton (or any trigger element)
  onConfirm: () => void | Promise<void>; // called when user confirms
  title: string;
  description: string;
  yesText?: string;
  noText?: string;
  variant?: "destructive" | "default"; // styling for Yes button
  disabled?: boolean;
};

export function ConfirmDialog({
  children,
  onConfirm,
  title,
  description,
  yesText,
  noText,
  variant = "destructive",
  disabled = false,
}: ConfirmDialogProps) {
  const tc = useTranslations("common");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{noText ?? tc("cancel")}</AlertDialogCancel>

          <AlertDialogAction
            onClick={onConfirm}
            disabled={disabled}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {yesText ?? tc("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
