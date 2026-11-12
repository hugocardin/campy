import CampgroundCardSkeleton from "@/components/search/CampgroundCardSkeleton";
import CampgroundList from "@/components/search/CampgroundList";
import CampgroundsMapDynamic from "@/components/search/CampgroundsMapDynamic";
import CampgroundListControls from "@/components/search/list/CampgroundListControls";
import {
  getCampgroundProvinces,
  getCampgrounds,
} from "@/data/campgrounds/get-campgrounds";
import { parseCampgroundSort } from "@/lib/campground-search";
import { getActionErrorId, translateErrorCode } from "@/lib/errors";
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
  const sort = parseCampgroundSort(firstParam(params.sort));
  const province = firstParam(params.province);

  const [campgroundsResult, provincesResult] = await Promise.all([
    getCampgrounds(q, sort, province),
    getCampgroundProvinces(),
  ]);

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

  const campgrounds = campgroundsResult.data;
  const provinces = provincesResult.success ? provincesResult.data : [];
  const tControls = await getTranslations("search.controls");

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
              provinces={provinces}
            />
          </Suspense>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 flex-1 min-h-0">
            <div className="flex flex-col min-h-75 lg:min-h-0 rounded-xl border border-border overflow-hidden">
              <div className="flex-1 relative min-h-75">
                <CampgroundsMapDynamic campgrounds={campgrounds} />
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
                        {tControls("noResults")}
                      </p>
                    ) : (
                      <CampgroundList campgrounds={campgrounds} />
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
