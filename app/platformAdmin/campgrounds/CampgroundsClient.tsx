"use client";

import { CampgroundAdmin } from "@/app/entities/campground-admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Props = {
  campgrounds: CampgroundAdmin[];
};

export default function CampgroundsClient({ campgrounds }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Phone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campgrounds.map((campground) => (
              <TableRow
                key={campground.id}
                onClick={() => {
                  const url = routes.platformAdmin.campgroundDetails(
                    campground.id,
                  );
                  console.log("Navigating to:", url);
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
                  {campground.owner_full_name} [{campground.owner_email}]
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
