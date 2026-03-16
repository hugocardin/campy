"use client";

import { Button } from "@/components/ui/button";
import { Tent } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type ManageSitesButtonProps = {
  href: string;
};

export function ManageSitesButton({ href }: ManageSitesButtonProps) {
  const t_site = useTranslations("entities.site");

  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <Tent className="mr-2 h-4 w-4" />
        {t_site("sites")}
      </Link>
    </Button>
  );
}
