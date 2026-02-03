"use client";

import { Campground } from "@/app/entities/campground";
import CampgroundCard from "./CampgroundCard";

type Props = {
  campgrounds: Campground[];
};

export default function CampgroundList({ campgrounds }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6 overflow-scroll">
      {campgrounds.map((campground) => (
        <CampgroundCard key={campground.id} campground={campground} />
      ))}
    </div>
  );
}
