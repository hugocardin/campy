import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getInitials } from "./person-initials";

describe("getInitials", () => {
  it("uses first and last word graphemes", () => {
    assert.equal(getInitials("Ada Lovelace"), "AL");
    assert.equal(getInitials("Jean-Luc Picard"), "JP");
  });

  it("caps multi-word names at two characters", () => {
    assert.equal(getInitials("Mary Ann Van Something"), "MS");
  });

  it("handles a single word", () => {
    assert.equal(getInitials("Prince"), "P");
  });

  it("takes the first grapheme for emoji-leading names", () => {
    const initials = getInitials("😀 Bob");
    // Full emoji grapheme + last-word initial (not a lone UTF-16 surrogate).
    assert.equal([...initials].length, 2);
    assert.equal([...initials][0], "😀");
    assert.equal([...initials][1], "B");
  });

  it("falls back to email when name is empty", () => {
    assert.equal(getInitials("", "camper@example.com"), "C");
    assert.equal(getInitials(null, "z@example.com"), "Z");
  });

  it("returns ? when both name and email are empty", () => {
    assert.equal(getInitials("", ""), "?");
  });
});
