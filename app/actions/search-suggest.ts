"use server";

import { suggestCampgrounds } from "@/data/campgrounds/suggest-campgrounds";
import { clientIpFromHeaders } from "@/lib/geocoding/client-ip";
import { geocodeCacheGet, geocodeCacheSet } from "@/lib/geocoding/geocode-cache";
import {
  photonCircuitIsOpen,
  photonCircuitRecordFailure,
  photonCircuitRecordSuccess,
} from "@/lib/geocoding/photon-circuit";
import { searchPhotonPlaces } from "@/lib/geocoding/photon";
import { geocodeRateLimitAllow } from "@/lib/geocoding/rate-limit";
import {
  SUGGEST_CAMPGROUND_LIMIT,
  SUGGEST_MIN_CHARS,
  SUGGEST_PLACE_LIMIT,
  photonLangFromLocale,
  type CampgroundSuggestion,
  type GeocodedPlace,
  type SearchSuggestion,
} from "@/lib/geocoding/types";
import { sanitizeCampgroundSearchTerm } from "@/lib/campground-search";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { handleUnexpectedError } from "@/lib/supabase/db-utils";
import { routing } from "@/i18n/routing";
import { headers } from "next/headers";

export type SearchSuggestUnavailable = "places" | "campgrounds" | "all";

export type SearchSuggestResult = {
  suggestions: SearchSuggestion[];
  /** Which half(s) failed — drives distinct UI copy. */
  unavailable?: SearchSuggestUnavailable;
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
    const ip = clientIpFromHeaders(headerStore);
    const rateKey = ip ? `photon:ip:${ip}` : "photon:global";
    const rateOk = geocodeRateLimitAllow(rateKey, { global: !ip });

    let places: GeocodedPlace[] = [];
    let placesUnavailable = false;

    const cached = geocodeCacheGet<GeocodedPlace[] | typeof NEGATIVE_SENTINEL>(
      cacheKey,
    );
    const campgroundsPromise = suggestCampgrounds(q, SUGGEST_CAMPGROUND_LIMIT);

    if (isNegativeCache(cached) || photonCircuitIsOpen()) {
      placesUnavailable = true;
    } else if (cached) {
      places = cached;
    } else if (!rateOk) {
      placesUnavailable = true;
    } else {
      try {
        places = await searchPhotonPlaces(q, {
          locale: lang === "fr" ? "fr-CA" : "en-CA",
          limit: SUGGEST_PLACE_LIMIT,
        });
        geocodeCacheSet(cacheKey, places);
        photonCircuitRecordSuccess();
      } catch (err) {
        console.error("[searchSuggest] Photon failed", err);
        places = [];
        placesUnavailable = true;
        geocodeCacheSet(cacheKey, NEGATIVE_SENTINEL, NEGATIVE_CACHE_TTL_MS);
        photonCircuitRecordFailure();
      }
    }

    const campgroundsResult = await campgroundsPromise;
    let campgrounds: CampgroundSuggestion[] = [];
    let campgroundsUnavailable = false;

    if (!campgroundsResult.success) {
      console.error(
        "[searchSuggest] suggest_campgrounds failed",
        campgroundsResult.errorCode,
        campgroundsResult.details,
      );
      campgroundsUnavailable = true;
    } else {
      campgrounds = campgroundsResult.data;
    }

    const suggestions: SearchSuggestion[] = [
      ...places.map((p) => ({ kind: "place" as const, ...p })),
      ...campgrounds.map((c) => ({ kind: "campground" as const, ...c })),
    ];

    let unavailable: SearchSuggestUnavailable | undefined;
    if (placesUnavailable && campgroundsUnavailable) unavailable = "all";
    else if (placesUnavailable) unavailable = "places";
    else if (campgroundsUnavailable) unavailable = "campgrounds";

    return resultSuccess({
      suggestions,
      unavailable,
    });
  } catch (err) {
    return handleUnexpectedError(err);
  }
}
