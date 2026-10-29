import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLocalizedPath } from "./revalidate-localized-path";

describe("normalizeLocalizedPath", () => {
  it("maps home variants to an empty suffix", () => {
    assert.equal(normalizeLocalizedPath("/"), "");
    assert.equal(normalizeLocalizedPath(""), "");
    assert.equal(normalizeLocalizedPath("/en-CA"), "");
    assert.equal(normalizeLocalizedPath("/fr-CA/"), "");
    assert.equal(normalizeLocalizedPath("/?x=1"), "");
    assert.equal(normalizeLocalizedPath("/#hash"), "");
  });

  it("adds a leading slash when missing", () => {
    assert.equal(normalizeLocalizedPath("x"), "/x");
    assert.equal(normalizeLocalizedPath("platformAdmin/amenities"), "/platformAdmin/amenities");
  });

  it("keeps bare app paths", () => {
    assert.equal(normalizeLocalizedPath("/x"), "/x");
    assert.equal(
      normalizeLocalizedPath("/platformAdmin/amenities"),
      "/platformAdmin/amenities",
    );
  });

  it("strips an already-localized prefix", () => {
    assert.equal(normalizeLocalizedPath("/en-CA/x"), "/x");
    assert.equal(
      normalizeLocalizedPath("/fr-CA/platformAdmin"),
      "/platformAdmin",
    );
  });

  it("strips query, hash, and trailing slashes", () => {
    assert.equal(normalizeLocalizedPath("/x/?a=1"), "/x");
    assert.equal(normalizeLocalizedPath("/x#y"), "/x");
    assert.equal(normalizeLocalizedPath("/platformAdmin/"), "/platformAdmin");
    assert.equal(
      normalizeLocalizedPath("/en-CA/platformAdmin/?tab=1#top"),
      "/platformAdmin",
    );
  });
});
