"use client";

import { Campground } from "@/entities/campground";
import type { CampgroundDetailQuery } from "@/lib/routes";
import { useCallback, useState } from "react";
import CampgroundList from "./CampgroundList";
import CampgroundsMapDynamic from "./CampgroundsMapDynamic";

type Props = {
  campgrounds: Campground[];
  searchCenter?: { lat: number; lng: number };
  radiusKm?: number;
  searchKey: string;
  searchQuery?: string;
  detailQuery?: CampgroundDetailQuery;
  emptyMessage: string;
};

type HoverState = {
  /** Search identity this hover belongs to — reset when it changes. */
  key: string;
  id: string | null;
  /** Which pane drove the hover — list→map never scrolls; map→list does. */
  source: "list" | "map" | null;
};

/**
 * Shared list ↔ map hover sync for guest search (#24 §4).
 * Hover a card to highlight its pin, and the reverse.
 */
export default function SearchResultsPanel({
  campgrounds,
  searchCenter,
  radiusKm,
  searchKey,
  searchQuery,
  detailQuery,
  emptyMessage,
}: Props) {
  const [hover, setHover] = useState<HoverState>({
    key: searchKey,
    id: null,
    source: null,
  });

  // Adjust during render when search identity changes (avoid setState-in-effect).
  if (hover.key !== searchKey) {
    setHover({ key: searchKey, id: null, source: null });
  }

  const hoveredId = hover.key === searchKey ? hover.id : null;
  const hoverSource = hover.key === searchKey ? hover.source : null;

  const hoverFromList = useCallback(
    (id: string | null) => {
      setHover({ key: searchKey, id, source: id ? "list" : null });
    },
    [searchKey],
  );

  const hoverFromMap = useCallback(
    (id: string | null) => {
      setHover({ key: searchKey, id, source: id ? "map" : null });
    },
    [searchKey],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 flex-1 min-h-0">
      <div className="flex flex-col min-h-75 lg:min-h-0 rounded-xl border border-border overflow-hidden">
        <div className="flex-1 relative min-h-75">
          <CampgroundsMapDynamic
            campgrounds={campgrounds}
            searchCenter={searchCenter}
            radiusKm={radiusKm}
            searchKey={searchKey}
            searchQuery={searchQuery}
            detailQuery={detailQuery}
            highlightedId={hoveredId}
            onHoverCampground={hoverFromMap}
          />
        </div>
      </div>

      <div className="flex flex-col min-h-0 rounded-xl border border-border">
        <div className="flex-1">
          <div className="p-6">
            {campgrounds.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                {emptyMessage}
              </p>
            ) : (
              <CampgroundList
                campgrounds={campgrounds}
                detailQuery={detailQuery}
                highlightedId={hoveredId}
                scrollHighlightedIntoView={hoverSource === "map"}
                onHoverCampground={hoverFromList}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
