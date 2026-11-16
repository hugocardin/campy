import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUEST_MAX_PRICE_CAP,
  formatCampgroundPricePerNight,
  formatGuestMaxPriceParam,
  parseGuestMaxPrice,
} from "./campground-price";

describe("parseGuestMaxPrice", () => {
  it("accepts positive amounts within cap", () => {
    assert.equal(parseGuestMaxPrice("50"), 50);
    assert.equal(parseGuestMaxPrice("49.99"), 49.99);
    assert.equal(parseGuestMaxPrice(100), 100);
  });

  it("rejects zero, negative, junk, and over-cap", () => {
    assert.equal(parseGuestMaxPrice("0"), undefined);
    assert.equal(parseGuestMaxPrice("-1"), undefined);
    assert.equal(parseGuestMaxPrice("abc"), undefined);
    assert.equal(parseGuestMaxPrice(""), undefined);
    assert.equal(parseGuestMaxPrice(GUEST_MAX_PRICE_CAP + 1), undefined);
  });
});

describe("formatGuestMaxPriceParam / display", () => {
  it("serializes cleanly", () => {
    assert.equal(formatGuestMaxPriceParam(50), "50");
    assert.equal(formatGuestMaxPriceParam(49.9), "49.90");
    assert.equal(formatGuestMaxPriceParam(0), undefined);
  });

  it("formats CAD for cards", () => {
    assert.equal(formatCampgroundPricePerNight(48, "en-CA"), "$48");
    assert.equal(formatCampgroundPricePerNight(null, "en-CA"), null);
  });
});
