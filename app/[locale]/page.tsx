import CampgroundCardSkeleton from "@/components/search/CampgroundCardSkeleton";
import CampgroundList from "@/components/search/CampgroundList";
import CampgroundsMapDynamic from "@/components/search/CampgroundsMapDynamic";
import CampgroundListControls from "@/components/search/list/CampgroundListControls";
import { getAllAmenities } from "@/data/amenities/get-amenities";
import {
  buildCampgroundSiteFiltersCacheKey,
  getCampgroundProvinces,
  getCampgrounds,
} from "@/data/campgrounds/get-campgrounds";
import { getCurrentRigSearchPrefs } from "@/data/profile/get-rig-search-prefs";
import {
  parseCampgroundGeo,
  parseCampgroundSiteFilters,
  parseCampgroundSort,
} from "@/lib/campground-search";
import { campgroundSearchKey } from "@/lib/campground-search-query";
import { getActionErrorId, translateErrorCode } from "@/lib/errors";
import {
  amenityCodeCanonicalKey,
  guestSearchAmenityCatalog,
} from "@/lib/guest-amenity-codes";
import { campingSiteAttrsAllowed } from "@/lib/guest-site-types";
import type { CampgroundDetailQuery } from "@/lib/routes";
import {
  resolveGuestRigLengthState,
  resolveGuestRigLengthUnit,
} from "@/lib/site-rig-length";
import { generatePageMetadata } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

const PAGE_NAMESPACE = "search.SearchPage" as const;

export const generateMetadata = () => generatePageMetadata(PAGE_NAMESPACE);

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = firstParam(params.q);
  const province = firstParam(params.province);
  const geo = parseCampgroundGeo({
    lat: firstParam(params.lat),
    lng: firstParam(params.lng),
    radiusKm: firstParam(params.radiusKm),
  });
  const siteFiltersParsed = parseCampgroundSiteFilters({
    amps: firstParam(params.amps),
    electricity: firstParam(params.electricity),
    water: firstParam(params.water),
    sewer: firstParam(params.sewer),
    dump: firstParam(params.dump),
    driveway: firstParam(params.driveway),
    rigLength: firstParam(params.rigLength),
    stay: firstParam(params.stay),
    types: firstParam(params.types),
    maxPrice: firstParam(params.maxPrice),
    amenities: firstParam(params.amenities),
  });
  const sort = parseCampgroundSort(firstParam(params.sort), {
    geoActive: Boolean(geo),
  });
  const rigUnitParam = firstParam(params.rigUnit);
  const rigUnitParamPresent = "rigUnit" in params;
  const rigLengthParamPresent = "rigLength" in params;

  // Prefs + provinces + amenity catalog in parallel; campgrounds need length first.
  const [prefs, provincesResult, amenitiesResult] = await Promise.all([
    getCurrentRigSearchPrefs(),
    getCampgroundProvinces(),
    getAllAmenities(),
  ]);
  const { preferredRigUnit, defaultRigLength } = prefs;
  if (!amenitiesResult.success) {
    console.warn(
      "[Home] getAllAmenities failed; amenity checkboxes fall back to URL codes",
      amenitiesResult.errorCode,
    );
  }
  const catalogAmenities = amenitiesResult.success
    ? guestSearchAmenityCatalog(amenitiesResult.data)
    : [];
  const catalogKeySet = new Set(
    catalogAmenities.map((a) => amenityCodeCanonicalKey(a.code)),
  );
  // Catalog checkboxes + any URL-only (stale) codes so the guest can uncheck.
  // RPC fail-closes unknown codes so results stay honest.
  const guestAmenityOptions = [
    ...catalogAmenities.map((a) => ({ code: a.code })),
    ...siteFiltersParsed.amenityCodes
      .filter((key) => !catalogKeySet.has(key))
      .map((key) => ({ code: key })),
  ];

  const campingOk = campingSiteAttrsAllowed(
    siteFiltersParsed.stayKind,
    siteFiltersParsed.siteTypes,
  );
  const resolvedRig = resolveGuestRigLengthState({
    raw: firstParam(params.rigLength),
    present: rigLengthParamPresent,
    defaultFeet: defaultRigLength,
    campingOk,
  });
  const siteFilters = {
    ...siteFiltersParsed,
    rigLength: resolvedRig.feet,
  };
  const siteFiltersKey = buildCampgroundSiteFiltersCacheKey(siteFilters);

  const campgroundsResult = await getCampgrounds(
    q,
    sort,
    province,
    geo?.lat,
    geo?.lng,
    geo?.radiusKm,
    siteFiltersKey,
  );

  // URL wins; else signed-in preference / default; else feet / no length.
  const resolvedRigUnit = resolveGuestRigLengthUnit(
    rigUnitParam,
    preferredRigUnit,
    rigUnitParamPresent,
  );
  const detailQuery: CampgroundDetailQuery = {
    rigUnit: resolvedRigUnit,
  };

  if (!campgroundsResult.success) {
    const tc = await getTranslations("common");
    const tErrors = await getTranslations("errors");
    const errorId = getActionErrorId(campgroundsResult.details);
    const message = translateErrorCode(
      campgroundsResult.errorCode,
      tErrors,
      tc("error"),
      campgroundsResult.details,
    );
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-6" />
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          {tc("somethingWentWrong")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mb-2">{message}</p>
        {errorId ? (
          <p className="text-sm text-muted-foreground max-w-md mb-8">
            {tc("errorReference", { errorId })}
          </p>
        ) : (
          <div className="mb-8" />
        )}
      </div>
    );
  }

  const { campgrounds, truncated } = campgroundsResult.data;
  const provinces = provincesResult.success ? provincesResult.data : [];
  const tControls = await getTranslations("search.controls");
  // Same axes as getCampgrounds; sort omitted — see campgroundSearchKey.
  const mapSearchKey = campgroundSearchKey({
    q,
    province,
    lat: geo?.lat,
    lng: geo?.lng,
    radiusKm: geo?.radiusKm,
    siteFiltersKey,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-auto">
        <div className="shrink-0 mb-6 md:mb-8">
          <Suspense
            fallback={
              <div className="h-10 rounded-md bg-muted/40 animate-pulse" />
            }
          >
            <CampgroundListControls
              resultCount={campgrounds.length}
              resultsTruncated={truncated}
              provinces={provinces}
              amenityOptions={guestAmenityOptions}
              initialRigUnit={resolvedRigUnit}
              preferredRigUnit={preferredRigUnit}
              defaultRigLength={defaultRigLength}
              initialRigLength={resolvedRig.feet}
            />
          </Suspense>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 flex-1 min-h-0">
            <div className="flex flex-col min-h-75 lg:min-h-0 rounded-xl border border-border overflow-hidden">
              <div className="flex-1 relative min-h-75">
                <Suspense
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-muted-foreground">
                      <p className="text-sm">{tControls("mapLoading")}</p>
                    </div>
                  }
                >
                  <CampgroundsMapDynamic
                    campgrounds={campgrounds}
                    searchCenter={
                      geo ? { lat: geo.lat, lng: geo.lng } : undefined
                    }
                    radiusKm={geo?.radiusKm}
                    searchKey={mapSearchKey}
                    searchQuery={q}
                    detailQuery={detailQuery}
                  />
                </Suspense>
              </div>
            </div>

            <div className="flex flex-col min-h-0 rounded-xl border border-border">
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
                    {campgrounds.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-12">
                        {q?.trim()
                          ? tControls("noResultsFor", { query: q.trim() })
                          : tControls("noResults")}
                      </p>
                    ) : (
                      <CampgroundList
                        campgrounds={campgrounds}
                        detailQuery={detailQuery}
                      />
                    )}
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
