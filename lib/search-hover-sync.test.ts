import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSearchHover,
  scrollChildIntoContainer,
  shouldScrollListOnMapHover,
  type SearchHoverState,
} from "./search-hover-sync";

describe("resolveSearchHover", () => {
  it("returns hover when keys match", () => {
    const hover: SearchHoverState = {
      key: "q=alice",
      id: "cg-1",
      source: "list",
    };
    assert.deepEqual(resolveSearchHover(hover, "q=alice"), {
      id: "cg-1",
      source: "list",
    });
  });

  it("clears highlight when searchKey changes", () => {
    const hover: SearchHoverState = {
      key: "q=alice",
      id: "cg-1",
      source: "map",
    };
    assert.deepEqual(resolveSearchHover(hover, "q=bob"), {
      id: null,
      source: null,
    });
  });
});

describe("shouldScrollListOnMapHover", () => {
  it("scrolls only for map-driven hover when side-by-side", () => {
    assert.equal(shouldScrollListOnMapHover("map", true), true);
    assert.equal(shouldScrollListOnMapHover("map", false), false);
    assert.equal(shouldScrollListOnMapHover("list", true), false);
    assert.equal(shouldScrollListOnMapHover(null, true), false);
  });
});

describe("scrollChildIntoContainer", () => {
  it("no-ops when the child is already fully visible", () => {
    const container = {
      getBoundingClientRect: () => ({ top: 0, bottom: 200, height: 200 }),
      scrollTop: 40,
      scrollToCalls: [] as { top: number; behavior: string }[],
      scrollTo(opts: { top: number; behavior: string }) {
        this.scrollToCalls.push(opts);
      },
    };
    const child = {
      getBoundingClientRect: () => ({ top: 20, bottom: 80, height: 60 }),
    };
    scrollChildIntoContainer(
      container as unknown as HTMLElement,
      child as unknown as HTMLElement,
    );
    assert.equal(container.scrollToCalls.length, 0);
  });

  it("scrolls the container when the child is below the visible area", () => {
    const container = {
      getBoundingClientRect: () => ({ top: 0, bottom: 100, height: 100 }),
      scrollTop: 0,
      scrollToCalls: [] as { top: number; behavior: string }[],
      scrollTo(opts: { top: number; behavior: string }) {
        this.scrollToCalls.push(opts);
      },
    };
    const child = {
      getBoundingClientRect: () => ({ top: 150, bottom: 210, height: 60 }),
    };
    scrollChildIntoContainer(
      container as unknown as HTMLElement,
      child as unknown as HTMLElement,
    );
    assert.equal(container.scrollToCalls.length, 1);
    assert.equal(container.scrollToCalls[0].behavior, "smooth");
    // Center child: delta = 150 - 0 - (100-60)/2 = 130
    assert.equal(container.scrollToCalls[0].top, 130);
  });
});
