"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

type ManageAmenitiesButtonProps = {
  href: string;
};

export function ManageAmenitiesButton({ href }: ManageAmenitiesButtonProps) {
  const t_amenities = useTranslations("amenities");

  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <ListChecks className="mr-2 h-4 w-4" />
        {t_amenities("plural")}
      </Link>
    </Button>
  );
}
