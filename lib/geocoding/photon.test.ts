import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPhotonSearchUrl, PHOTON_OSM_TAGS } from "./photon-url";
import { photonLangFromLocale } from "./types";

describe("photonLangFromLocale", () => {
  it("maps fr-* to fr and everything else to en", () => {
    assert.equal(photonLangFromLocale("fr-CA"), "fr");
    assert.equal(photonLangFromLocale("fr"), "fr");
    assert.equal(photonLangFromLocale("en-CA"), "en");
    assert.equal(photonLangFromLocale("en"), "en");
  });
});

describe("buildPhotonSearchUrl", () => {
  it("includes place + administrative osm_tags so cities are not AND-filtered out", () => {
    const url = buildPhotonSearchUrl("Sherbrooke", { locale: "en-CA" });
    assert.ok(url);
    const tags = url.searchParams.getAll("osm_tag");
    assert.ok(tags.includes("place"));
    assert.ok(tags.includes("boundary:administrative"));
    assert.ok(tags.includes("natural:water"));
    assert.deepEqual([...PHOTON_OSM_TAGS], tags);
  });
});
