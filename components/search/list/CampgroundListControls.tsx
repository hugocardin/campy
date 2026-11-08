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
import { useEffect, useRef, useState, useTransition } from "react";

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
  const [lastPushedQ, setLastPushedQ] = useState(qParam);

  const debounceTimeoutRef = useRef<number | null>(null);
  const latestParamsRef = useRef({ sort: sortParam, province: provinceParam });

  // Sync input from URL only for external changes (back/forward / Clear).
  // Skip when qParam is what we ourselves pushed — typing during an in-flight
  // navigation must not be overwritten. External URL changes also reset
  // lastPushedQ so re-typing the old query still navigates.
  if (qParam !== prevQParam) {
    setPrevQParam(qParam);
    if (qParam !== lastPushedQ) {
      setLastPushedQ(qParam);
      if (search.trim() !== qParam) {
        setSearch(qParam);
      }
    }
  }

  // Keep sort/province for debounce timeouts; replaceQuery also writes this
  // synchronously so selects aren't undone by a stale scheduled search.
  useEffect(() => {
    latestParamsRef.current = { sort: sortParam, province: provinceParam };
  }, [sortParam, provinceParam]);

  function clearDebounce() {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }

  function replaceQuery(next: {
    q: string;
    sort: CampgroundSort;
    province: string;
  }) {
    const trimmedQ = next.q.trim();
    setLastPushedQ(trimmedQ);
    latestParamsRef.current = {
      sort: next.sort,
      province: next.province,
    };

    const params = new URLSearchParams();
    if (trimmedQ) {
      params.set("q", trimmedQ);
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
    const trimmed = search.trim();
    // Skip while URL catches up to a value we already pushed (incl. Clear).
    if (trimmed === qParam || trimmed === lastPushedQ) return;

    clearDebounce();
    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      const { sort, province } = latestParamsRef.current;
      replaceQuery({
        q: search,
        sort,
        province,
      });
    }, 300);

    return clearDebounce;
    // Select/Clear cancel via clearDebounce before their own replaceQuery.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on `search`
  }, [search, qParam, lastPushedQ]);

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
        onValueChange={(value) => {
          clearDebounce();
          replaceQuery({
            q: search,
            sort: parseCampgroundSort(value),
            province: latestParamsRef.current.province,
          });
        }}
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
        onValueChange={(value) => {
          clearDebounce();
          replaceQuery({
            q: search,
            sort: latestParamsRef.current.sort,
            province: value === ALL_PROVINCES ? "" : value,
          });
        }}
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
            clearDebounce();
            setSearch("");
            replaceQuery({
              q: "",
              sort: latestParamsRef.current.sort,
              province: "",
            });
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
