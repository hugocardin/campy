import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { photonLangFromLocale } from "./types";

describe("photonLangFromLocale", () => {
  it("maps fr-* to fr and everything else to en", () => {
    assert.equal(photonLangFromLocale("fr-CA"), "fr");
    assert.equal(photonLangFromLocale("fr"), "fr");
    assert.equal(photonLangFromLocale("en-CA"), "en");
    assert.equal(photonLangFromLocale("en"), "en");
  });
});
