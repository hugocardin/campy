"use client";

import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import Link from "next/link";

type EditButtonProps = {
  href: string;
};

export function EditButton({ href }: EditButtonProps) {
  return (
    <Button asChild variant="outline">
      <Link href={href}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit
      </Link>
    </Button>
  );
}
