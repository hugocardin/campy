"use server";

import { suggestCampgrounds } from "@/data/campgrounds/suggest-campgrounds";
import { geocodeCacheGet, geocodeCacheSet } from "@/lib/geocoding/geocode-cache";
import { searchPhotonPlaces } from "@/lib/geocoding/photon";
import {
  SUGGEST_CAMPGROUND_LIMIT,
  SUGGEST_MIN_CHARS,
  SUGGEST_PLACE_LIMIT,
  type GeocodedPlace,
  type SearchSuggestion,
} from "@/lib/geocoding/types";
import { sanitizeCampgroundSearchTerm } from "@/lib/campground-search";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";

export type SearchSuggestResult = {
  suggestions: SearchSuggestion[];
  /** True when place geocoding failed (campgrounds may still be present). */
  placesUnavailable?: boolean;
};

/**
 * Mixed place + campground suggestions for the guest search box (#24).
 * Places: Photon (cached). Campgrounds: `suggest_campgrounds` RPC.
 */
export async function searchSuggestAction(
  rawQuery: string,
  locale: string,
): Promise<ActionResult<SearchSuggestResult>> {
  try {
    const q = sanitizeCampgroundSearchTerm(rawQuery);
    if (q.length < SUGGEST_MIN_CHARS) {
      return resultSuccess({ suggestions: [] });
    }

    const cacheKey = `photon:${locale}:${q.toLowerCase()}`;
    let places: GeocodedPlace[] | undefined = geocodeCacheGet(cacheKey);
    let placesUnavailable = false;

    const campgroundsPromise = suggestCampgrounds(q, SUGGEST_CAMPGROUND_LIMIT);

    if (!places) {
      try {
        places = await searchPhotonPlaces(q, {
          locale,
          limit: SUGGEST_PLACE_LIMIT,
        });
        geocodeCacheSet(cacheKey, places);
      } catch {
        places = [];
        placesUnavailable = true;
      }
    }

    const campgroundsResult = await campgroundsPromise;
    const campgrounds = campgroundsResult.success
      ? campgroundsResult.data
      : [];

    const suggestions: SearchSuggestion[] = [
      ...places.map((p) => ({ kind: "place" as const, ...p })),
      ...campgrounds.map((c) => ({ kind: "campground" as const, ...c })),
    ];

    return resultSuccess({
      suggestions,
      placesUnavailable: placesUnavailable || undefined,
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
