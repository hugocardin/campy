export const metadata = {
  title: "Campy – Find and Book Campgrounds",
  description: "Discover tent sites, RV parks, cabins, glamping and more.",
};

import { Suspense } from "react";
import CampgroundCardSkeleton from "./components/search/list/CampgroundCardSkeleton";
import CampgroundList from "./components/search/list/CampgroundList";
import CampgroundListControls from "./components/search/list/CampgroundListControls";
import { getCampgrounds } from "./data/campgrounds/get-campgrounds";

export default async function Home() {
  const campgrounds = await getCampgrounds();

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">
        {/* Controls */}
        <div className="shrink-0 mb-6 md:mb-8">
          <CampgroundListControls />
        </div>

        {/* This is the main content area that should take all remaining space */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 flex-1 min-h-0">
            {/* Map column */}
            <div className="flex flex-col min-h-75 lg:min-h-0 rounded-xl border border-gray-200">
              <div className="flex-1 relative">
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-gray-50/50">
                  <div className="text-center p-8">
                    <p className="text-lg font-medium mb-2">Map placeholder</p>
                    <p className="text-sm">
                      Leaflet / Mapbox / Google Maps goes here
                    </p>
                  </div>
                </div>

                {/* When ready */}
                {/* <MapComponent className="absolute inset-0 w-full h-full" campgrounds={campgrounds} /> */}
              </div>
            </div>

            {/* List column */}
            <div className="flex flex-col min-h-0 rounded-xl border border-gray-200">
              <div className="flex-1">
                <Suspense
                  fallback={
                    <div className="grid gap-6 p-6 sm:grid-cols-1 md:grid-cols-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <CampgroundCardSkeleton key={i} />
                      ))}
                    </div>
                  }
                >
                  <div className="p-6">
                    <CampgroundList campgrounds={campgrounds} />
                  </div>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
