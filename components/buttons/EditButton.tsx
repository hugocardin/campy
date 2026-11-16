"use client";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

type EditButtonProps = {
  href: string;
};

export function EditButton({ href }: EditButtonProps) {
  const tc = useTranslations("common");

  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <Pencil className="mr-2 h-4 w-4" />
        {tc("edit")}
      </Link>
    </Button>
  );
}
