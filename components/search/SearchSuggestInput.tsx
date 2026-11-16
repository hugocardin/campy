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

type SuggestErrorKind = "places" | "all" | null;

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
  const inputRef = useRef<HTMLInputElement>(null);
  /** True after the user types; false after choose / URL-driven value. */
  const [userTyped, setUserTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [errorKind, setErrorKind] = useState<SuggestErrorKind>(null);
  const [fetchedFor, setFetchedFor] = useState("");
  const requestIdRef = useRef(0);

  const trimmed = value.trim();
  const canSuggest = trimmed.length >= SUGGEST_MIN_CHARS;
  const visibleSuggestions =
    canSuggest && fetchedFor === trimmed ? suggestions : [];
  const visibleError =
    canSuggest && fetchedFor === trimmed ? errorKind : null;
  const visibleLoading = canSuggest && loading && userTyped;

  useEffect(() => {
    // Only fetch after the user typed — skip mount / place-label / URL sync.
    if (!canSuggest || !userTyped) {
      return;
    }

    const requestId = ++requestIdRef.current;
    const query = trimmed;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const result = await searchSuggestAction(query, locale);
          if (requestId !== requestIdRef.current) return;
          setFetchedFor(query);
          if (!result.success) {
            setSuggestions([]);
            setErrorKind("all");
            if (document.activeElement === inputRef.current) {
              setOpen(true);
            }
            return;
          }
          setSuggestions(result.data.suggestions);
          setErrorKind(result.data.placesUnavailable ? "places" : null);
          setHighlight(-1);
          if (document.activeElement === inputRef.current) {
            setOpen(true);
          }
        } catch {
          if (requestId !== requestIdRef.current) return;
          setFetchedFor(query);
          setSuggestions([]);
          setErrorKind("all");
          if (document.activeElement === inputRef.current) {
            setOpen(true);
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canSuggest, trimmed, locale, userTyped]);

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
    setUserTyped(false);
    setOpen(false);
    setSuggestions([]);
    setFetchedFor("");
    setErrorKind(null);
    setHighlight(-1);
    requestIdRef.current += 1;
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
      visibleError != null);

  const activeDescendant =
    showList && highlight >= 0 ? `${listId}-opt-${highlight}` : undefined;

  return (
    <div ref={rootRef} className="relative flex-1 min-w-48">
      <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder={t("searchPlaceholder")}
        className="pl-10"
        value={value}
        onChange={(e) => {
          setUserTyped(true);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (canSuggest && userTyped) setOpen(true);
        }}
        onBlur={() => {
          // Defer so option mousedown can choose before close.
          window.setTimeout(() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              setOpen(false);
            }
          }, 0);
        }}
        onKeyDown={onKeyDown}
        aria-label={t("searchPlaceholder")}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        aria-activedescendant={activeDescendant}
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
            const optionId = `${listId}-opt-${index}`;
            const title =
              suggestion.kind === "place"
                ? suggestion.label
                : suggestion.name;
            const subtitle =
              suggestion.kind === "place"
                ? suggestion.subtitle
                  ? `${t("suggestionPlace")} · ${suggestion.subtitle}`
                  : t("suggestionPlace")
                : `${t("suggestionCampground")}${
                    suggestion.city || suggestion.province
                      ? ` · ${formatCampgroundLocation(suggestion.city, suggestion.province)}`
                      : ""
                  }`;
            return (
              <li
                key={suggestion.id}
                id={optionId}
                role="option"
                aria-selected={selected}
                className={`flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                  selected ? "bg-muted" : ""
                }`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(suggestion);
                }}
              >
                <span className="font-medium">{title}</span>
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              </li>
            );
          })}
          {!visibleLoading &&
          visibleSuggestions.length === 0 &&
          visibleError === "places" ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              role="presentation"
            >
              {t("suggestionsPlacesUnavailable")}
            </li>
          ) : null}
          {!visibleLoading &&
          visibleSuggestions.length === 0 &&
          visibleError === "all" ? (
            <li
              className="px-3 py-2 text-sm text-muted-foreground"
              role="presentation"
            >
              {t("suggestionsError")}
            </li>
          ) : null}
          {!visibleLoading &&
          visibleSuggestions.length === 0 &&
          visibleError == null &&
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
