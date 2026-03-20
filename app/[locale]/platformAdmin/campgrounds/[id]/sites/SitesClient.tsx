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
import { Site } from "@/entities/sites";
import { routes } from "@/lib/routes";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Props = {
  campground: CampgroundAdmin;
  sites: Site[];
};

export default function SitesClient({ campground, sites }: Props) {
  const t_site = useTranslations("entities.site");

  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t_site("nameLabel")}</TableHead>
              <TableHead>{t_site("descriptionLabel")}</TableHead>
              <TableHead>{t_site("siteTypeLabel")}</TableHead>
              <TableHead>{t_site("maxRigLengthLabel")}</TableHead>
              <TableHead>{t_site("pricePerNightLabel")}</TableHead>
              <TableHead>{t_site("minStayNightLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => (
              <TableRow
                key={site.id}
                onClick={() => {
                  const url = routes.platformAdmin.campgroundSiteView(
                    campground.id,
                    site.id,
                  );
                  router.push(url);
                }}
              >
                <TableCell>{site.name}</TableCell>
                <TableCell>{site.description}</TableCell>
                <TableCell>{site.site_type_code}</TableCell>
                <TableCell>{site.max_rig_length}</TableCell>
                <TableCell>{site.price_per_night}</TableCell>
                <TableCell>{site.min_stay_nights}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
