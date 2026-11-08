"use client";

import { Campground } from "@/entities/campground";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

type Props = {
  campgrounds: Campground[];
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

export default function CampgroundsMapDynamic({ campgrounds }: Props) {
  return <CampgroundsMap campgrounds={campgrounds} />;
}
