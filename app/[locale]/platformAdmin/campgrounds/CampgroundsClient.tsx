"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CampgroundAdmin } from "@/entities/campground-admin";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Props = {
  campgrounds: CampgroundAdmin[];
};

export default function CampgroundsClient({ campgrounds }: Props) {
  const t_campground = useTranslations("entities.campground");

  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t_campground("nameLabel")}</TableHead>
              <TableHead>{t_campground("locationLabel")}</TableHead>
              <TableHead>{t_campground("ownerLabel")}</TableHead>
              <TableHead>{t_campground("phoneLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campgrounds.map((campground) => (
              <TableRow
                key={campground.id}
                onClick={() => {
                  const url = routes.platformAdmin.campgroundView(
                    campground.id,
                  );
                  router.push(url);
                }}
              >
                <TableCell
                  className={cn(
                    "font-medium",
                    !campground.active && "text-muted-foreground italic",
                  )}
                >
                  {campground.name}
                </TableCell>

                <TableCell>
                  {campground.city}, {campground.province},
                </TableCell>

                <TableCell>
                  {campground.owner_full_name
                    ? `${campground.owner_full_name} (${campground.owner_email})`
                    : campground.owner_email}
                </TableCell>

                <TableCell>{campground.phone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
