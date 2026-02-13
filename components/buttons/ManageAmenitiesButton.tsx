"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ManageAmenitiesButtonProps = {
  href: string;
};

export function ManageAmenitiesButton({ href }: ManageAmenitiesButtonProps) {
  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <ListChecks className="mr-2 h-4 w-4" />
        Manage amenities
      </Link>
    </Button>
  );
}
