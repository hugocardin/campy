import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FULL_NAME_MAX_LENGTH,
  normalizePersonName,
} from "./profile-validation";

describe("normalizePersonName", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizePersonName("  Ada   Lovelace  "), "Ada Lovelace");
  });

  it("strips zero-width and bidi format characters", () => {
    assert.equal(normalizePersonName("\u200BAda\u202E"), "Ada");
    assert.equal(normalizePersonName("\u200B\u200D\uFEFF"), "");
  });

  it("NFC-normalizes combining characters", () => {
    // e + combining acute → é
    assert.equal(normalizePersonName("e\u0301"), "é");
  });

  it("exposes the shared max length constant", () => {
    assert.equal(FULL_NAME_MAX_LENGTH, 120);
  });
});
