/**
 * Pure helpers for guest search list ↔ map hover sync (#24 §4).
 */

export type SearchHoverSource = "list" | "map";

export type SearchHoverState = {
  /** Search identity this hover belongs to. */
  key: string;
  id: string | null;
  source: SearchHoverSource | null;
};

/**
 * Ignore hover stamped under a previous searchKey (writers stamp the current
 * key; no render-time setState reset needed).
 */
export function resolveSearchHover(
  hover: SearchHoverState,
  searchKey: string,
): { id: string | null; source: SearchHoverSource | null } {
  if (hover.key !== searchKey) {
    return { id: null, source: null };
  }
  return { id: hover.id, source: hover.source };
}

/** Map→list scroll only when panes are side-by-side (lg+). */
export function shouldScrollListOnMapHover(
  source: SearchHoverSource | null,
  sideBySide: boolean,
): boolean {
  return source === "map" && sideBySide;
}

/**
 * Scroll `child` into view inside `container` only — never the window.
 * No-op when already fully visible in the container.
 */
export function scrollChildIntoContainer(
  container: HTMLElement,
  child: HTMLElement,
): void {
  const cRect = container.getBoundingClientRect();
  const eRect = child.getBoundingClientRect();
  if (eRect.top >= cRect.top && eRect.bottom <= cRect.bottom) return;
  const delta =
    eRect.top - cRect.top - (cRect.height - eRect.height) / 2;
  container.scrollTo({
    top: Math.max(0, container.scrollTop + delta),
    behavior: "smooth",
  });
}
