"use server";

import { suggestCampgrounds } from "@/data/campgrounds/suggest-campgrounds";
import { geocodeCacheGet, geocodeCacheSet } from "@/lib/geocoding/geocode-cache";
import { searchPhotonPlaces } from "@/lib/geocoding/photon";
import { geocodeRateLimitAllow } from "@/lib/geocoding/rate-limit";
import {
  SUGGEST_CAMPGROUND_LIMIT,
  SUGGEST_MIN_CHARS,
  SUGGEST_PLACE_LIMIT,
  photonLangFromLocale,
  type GeocodedPlace,
  type SearchSuggestion,
} from "@/lib/geocoding/types";
import { sanitizeCampgroundSearchTerm } from "@/lib/campground-search";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { routing } from "@/i18n/routing";
import { headers } from "next/headers";

export type SearchSuggestResult = {
  suggestions: SearchSuggestion[];
  /** True when place geocoding failed (campgrounds may still be present). */
  placesUnavailable?: boolean;
};

const NEGATIVE_CACHE_TTL_MS = 30_000;
const NEGATIVE_SENTINEL = { __photonFailed: true } as const;

function isNegativeCache(
  value: GeocodedPlace[] | typeof NEGATIVE_SENTINEL | undefined,
): value is typeof NEGATIVE_SENTINEL {
  return (
    value != null &&
    typeof value === "object" &&
    "__photonFailed" in value &&
    value.__photonFailed === true
  );
}

function normalizeSuggestLocale(locale: string): "en" | "fr" {
  const allowed = routing.locales as readonly string[];
  const safe = allowed.includes(locale) ? locale : routing.defaultLocale;
  return photonLangFromLocale(safe);
}

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

    const lang = normalizeSuggestLocale(locale);
    const cacheKey = `photon:${lang}:${q.toLowerCase()}`;

    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      "unknown";

    let places: GeocodedPlace[] = [];
    let placesUnavailable = false;

    const cached = geocodeCacheGet<GeocodedPlace[] | typeof NEGATIVE_SENTINEL>(
      cacheKey,
    );
    const campgroundsPromise = suggestCampgrounds(q, SUGGEST_CAMPGROUND_LIMIT);

    if (isNegativeCache(cached)) {
      placesUnavailable = true;
    } else if (cached) {
      places = cached;
    } else if (!geocodeRateLimitAllow(`photon:${ip}`)) {
      placesUnavailable = true;
    } else {
      try {
        places = await searchPhotonPlaces(q, {
          locale: lang === "fr" ? "fr-CA" : "en-CA",
          limit: SUGGEST_PLACE_LIMIT,
        });
        geocodeCacheSet(cacheKey, places);
      } catch {
        places = [];
        placesUnavailable = true;
        geocodeCacheSet(cacheKey, NEGATIVE_SENTINEL, NEGATIVE_CACHE_TTL_MS);
      }
    }

    const campgroundsResult = await campgroundsPromise;
    const campgrounds = campgroundsResult.success
      ? campgroundsResult.data
      : [];

    // Whole action path succeeded; surface places-only degradation separately.
    // Campground RPC failure with empty places → treat as all-unavailable via
    // empty suggestions (UI uses placesUnavailable only when places half failed).
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
