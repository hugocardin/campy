"use client";

import { Campground } from "@/entities/campground";
import type { CampgroundDetailQuery } from "@/lib/routes";
import {
  resolveSearchHover,
  shouldScrollListOnMapHover,
  type SearchHoverState,
} from "@/lib/search-hover-sync";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [hover, setHover] = useState<SearchHoverState>({
    key: searchKey,
    id: null,
    source: null,
  });
  const [sideBySide, setSideBySide] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setSideBySide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Derived only — writers stamp searchKey; stale hover is ignored.
  const { id: hoveredId, source: hoverSource } = resolveSearchHover(
    hover,
    searchKey,
  );

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

      <div className="flex flex-col min-h-0 rounded-xl border border-border overflow-hidden">
        <div ref={listScrollRef} className="flex-1 min-h-0 overflow-auto p-6">
          {campgrounds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {emptyMessage}
            </p>
          ) : (
            <CampgroundList
              campgrounds={campgrounds}
              detailQuery={detailQuery}
              highlightedId={hoveredId}
              scrollHighlightedIntoView={shouldScrollListOnMapHover(
                hoverSource,
                sideBySide,
              )}
              scrollContainerRef={listScrollRef}
              onHoverCampground={hoverFromList}
            />
          )}
        </div>
      </div>
    </div>
  );
}
