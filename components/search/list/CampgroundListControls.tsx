"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CampgroundSort,
  parseCampgroundSort,
} from "@/lib/campground-search";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Props = {
  resultCount: number;
  provinces: string[];
};

const ALL_PROVINCES = "__all__";

export default function CampgroundListControls({
  resultCount,
  provinces,
}: Props) {
  const t = useTranslations("search.controls");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const qParam = searchParams.get("q") ?? "";
  const sortParam = parseCampgroundSort(
    searchParams.get("sort") ?? undefined,
  );
  const provinceParam = searchParams.get("province") ?? "";

  const [search, setSearch] = useState(qParam);
  const [prevQParam, setPrevQParam] = useState(qParam);

  // Keep the input aligned when the URL changes (back/forward / clear).
  if (qParam !== prevQParam) {
    setPrevQParam(qParam);
    setSearch(qParam);
  }

  function replaceQuery(next: {
    q: string;
    sort: CampgroundSort;
    province: string;
  }) {
    const params = new URLSearchParams();

    if (next.q.trim()) {
      params.set("q", next.q.trim());
    }
    if (next.sort && next.sort !== "name") {
      params.set("sort", next.sort);
    }
    if (next.province) {
      params.set("province", next.province);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  useEffect(() => {
    if (search === qParam) return;

    const handle = window.setTimeout(() => {
      replaceQuery({
        q: search,
        sort: sortParam,
        province: provinceParam,
      });
    }, 300);

    return () => window.clearTimeout(handle);
    // Debounce the search box only; sort/province updates call replaceQuery directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on `search`
  }, [search]);

  return (
    <div
      className={`space-y-4 md:space-y-0 md:flex md:items-end md:gap-4 lg:gap-6 ${isPending ? "opacity-80" : ""}`}
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("searchPlaceholder")}
        />
      </div>

      <Select
        value={sortParam}
        onValueChange={(value) =>
          replaceQuery({
            q: search,
            sort: parseCampgroundSort(value),
            province: provinceParam,
          })
        }
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("sortLabel")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{t("sortNameAsc")}</SelectItem>
          <SelectItem value="name-desc">{t("sortNameDesc")}</SelectItem>
          <SelectItem value="city">{t("sortCity")}</SelectItem>
          <SelectItem value="province">{t("sortProvince")}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={provinceParam || ALL_PROVINCES}
        onValueChange={(value) =>
          replaceQuery({
            q: search,
            sort: sortParam,
            province: value === ALL_PROVINCES ? "" : value,
          })
        }
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("provinceLabel")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROVINCES}>{t("provinceAll")}</SelectItem>
          {provinces.map((province) => (
            <SelectItem key={province} value={province}>
              {province}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {search || provinceParam ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSearch("");
            replaceQuery({ q: "", sort: sortParam, province: "" });
          }}
        >
          {t("clearFilters")}
        </Button>
      ) : null}

      <div className="text-sm text-muted-foreground md:ml-auto">
        {t("resultCount", { count: resultCount })}
      </div>
    </div>
  );
}
