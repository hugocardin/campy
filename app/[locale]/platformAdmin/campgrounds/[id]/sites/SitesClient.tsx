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
import { useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { formatRigLength } from "@/lib/site-rig-length";
import { useTranslations } from "next-intl";

type Props = {
  campground: CampgroundAdmin;
  sites: Site[];
};

export default function SitesClient({ campground, sites }: Props) {
  const t_sites = useTranslations("sites");

  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t_sites("form.nameLabel")}</TableHead>
              <TableHead>{t_sites("form.descriptionLabel")}</TableHead>
              <TableHead>{t_sites("form.siteTypeLabel")}</TableHead>
              <TableHead>{t_sites("form.maxRigLengthLabel")}</TableHead>
              <TableHead>{t_sites("form.pricePerNightLabel")}</TableHead>
              <TableHead>{t_sites("form.minStayNightLabel")}</TableHead>
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
                <TableCell>
                  {formatRigLength(Number(site.max_rig_length), {
                    labels: {
                      ft: t_sites("form.rigLengthUnitFt"),
                      m: t_sites("form.rigLengthUnitM"),
                    },
                  }) ?? "—"}
                </TableCell>
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
