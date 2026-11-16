"use client";

import { Campground } from "@/entities/campground";
import type { CampgroundDetailQuery } from "@/lib/routes";
import type { RefObject } from "react";
import CampgroundCard from "./CampgroundCard";

type Props = {
  campgrounds: Campground[];
  detailQuery?: CampgroundDetailQuery;
  highlightedId?: string | null;
  scrollHighlightedIntoView?: boolean;
  /** List-only scroll parent — never the window (#50 review). */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  onHoverCampground?: (id: string | null) => void;
};

export default function CampgroundList({
  campgrounds,
  detailQuery,
  highlightedId = null,
  scrollHighlightedIntoView = false,
  scrollContainerRef,
  onHoverCampground,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
      {campgrounds.map((campground) => (
        <CampgroundCard
          key={campground.id}
          campground={campground}
          detailQuery={detailQuery}
          highlighted={highlightedId === campground.id}
          scrollIntoViewOnHighlight={
            scrollHighlightedIntoView && highlightedId === campground.id
          }
          scrollContainerRef={scrollContainerRef}
          onHover={onHoverCampground}
        />
      ))}
    </div>
  );
}
