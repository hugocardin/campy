"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { MouseEventHandler } from "react";

interface DeleteButtonProps {
  onConfirm?: () => void | Promise<void>;
  disabled?: boolean;
}

export function DeleteButton({
  onConfirm,
  disabled = false,
}: DeleteButtonProps) {
  const tc = useTranslations("common");

  const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();

    if (onConfirm) {
      onConfirm();
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {tc("delete")}
    </Button>
  );
}
