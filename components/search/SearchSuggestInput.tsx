"use client";

import { searchSuggestAction } from "@/app/actions/search-suggest";
import { Input } from "@/components/ui/input";
import {
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
  type SearchSuggestion,
} from "@/lib/geocoding/types";
import { formatCampgroundLocation } from "@/lib/format-campground-location";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (place: Extract<SearchSuggestion, { kind: "place" }>) => void;
  onSelectCampground: (
    campground: Extract<SearchSuggestion, { kind: "campground" }>,
  ) => void;
  disabled?: boolean;
};

export default function SearchSuggestInput({
  value,
  onChange,
  onSelectPlace,
  onSelectCampground,
  disabled,
}: Props) {
  const t = useTranslations("search.controls");
  const locale = useLocale();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const [fetchedFor, setFetchedFor] = useState("");
  const requestIdRef = useRef(0);

  const trimmed = value.trim();
  const canSuggest = trimmed.length >= SUGGEST_MIN_CHARS;
  // Ignore stale fetch results when the box drops below the min length.
  const visibleSuggestions = canSuggest && fetchedFor === trimmed ? suggestions : [];
  const visiblePlacesUnavailable =
    canSuggest && fetchedFor === trimmed ? placesUnavailable : false;
  const visibleLoading = canSuggest && loading;

  useEffect(() => {
    if (!canSuggest) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const query = trimmed;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        const result = await searchSuggestAction(query, locale);
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setFetchedFor(query);
        if (!result.success) {
          setSuggestions([]);
          setPlacesUnavailable(true);
          return;
        }
        setSuggestions(result.data.suggestions);
        setPlacesUnavailable(Boolean(result.data.placesUnavailable));
        setHighlight(-1);
        setOpen(true);
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canSuggest, trimmed, locale]);

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, []);

  function choose(suggestion: SearchSuggestion) {
    setOpen(false);
    setSuggestions([]);
    setFetchedFor("");
    if (suggestion.kind === "place") {
      onSelectPlace(suggestion);
    } else {
      onSelectCampground(suggestion);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleSuggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % visibleSuggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) =>
        h <= 0 ? visibleSuggestions.length - 1 : h - 1,
      );
      return;
    }
    if (event.key === "Enter" && highlight >= 0) {
      event.preventDefault();
      const selected = visibleSuggestions[highlight];
      if (selected) choose(selected);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const showList =
    open &&
    canSuggest &&
    (visibleLoading ||
      visibleSuggestions.length > 0 ||
      visiblePlacesUnavailable);

  return (
    <div ref={rootRef} className="relative flex-1 min-w-48">
      <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={t("searchPlaceholder")}
        className="pl-10"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (canSuggest) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        aria-label={t("searchPlaceholder")}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        role="combobox"
        disabled={disabled}
        autoComplete="off"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("suggestionsLabel")}
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-md"
        >
          {visibleLoading && visibleSuggestions.length === 0 ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              role="presentation"
            >
              {t("suggestionsLoading")}
            </li>
          ) : null}
          {visibleSuggestions.map((suggestion, index) => {
            const selected = index === highlight;
            if (suggestion.kind === "place") {
              return (
                <li key={suggestion.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                      selected ? "bg-muted" : ""
                    }`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(suggestion)}
                  >
                    <span className="font-medium">{suggestion.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.subtitle
                        ? `${t("suggestionPlace")} · ${suggestion.subtitle}`
                        : t("suggestionPlace")}
                    </span>
                  </button>
                </li>
              );
            }
            return (
              <li key={suggestion.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                    selected ? "bg-muted" : ""
                  }`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(suggestion)}
                >
                  <span className="font-medium">{suggestion.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("suggestionCampground")}
                    {suggestion.city || suggestion.province
                      ? ` · ${formatCampgroundLocation(suggestion.city, suggestion.province)}`
                      : ""}
                  </span>
                </button>
              </li>
            );
          })}
          {!visibleLoading &&
          visibleSuggestions.length === 0 &&
          visiblePlacesUnavailable ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              role="presentation"
            >
              {t("suggestionsPlacesUnavailable")}
            </li>
          ) : null}
          {!visibleLoading &&
          visibleSuggestions.length === 0 &&
          !visiblePlacesUnavailable &&
          canSuggest ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              role="presentation"
            >
              {t("suggestionsEmpty")}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
