"use client";

import { Campground } from "@/entities/campground";
import type { CampgroundDetailQuery } from "@/lib/routes";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

type Props = {
  campgrounds: Campground[];
  searchCenter?: { lat: number; lng: number };
  radiusKm?: number;
  searchKey?: string;
  detailQuery?: CampgroundDetailQuery;
};

const CampgroundsMap = dynamic(() => import("./CampgroundsMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});

function MapLoading() {
  const t = useTranslations("search.controls");
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground">
      <p className="text-sm">{t("mapLoading")}</p>
    </div>
  );
}

export default function CampgroundsMapDynamic({
  campgrounds,
  searchCenter,
  radiusKm,
  searchKey,
  detailQuery,
}: Props) {
  return (
    <CampgroundsMap
      campgrounds={campgrounds}
      searchCenter={searchCenter}
      radiusKm={radiusKm}
      searchKey={searchKey}
      detailQuery={detailQuery}
    />
  );
}
