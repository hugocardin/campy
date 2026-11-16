import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUEST_MAX_PRICE_CAP,
  GUEST_PRICE_CURRENCY,
  formatCampgroundPricePerNight,
  formatGuestMaxPriceParam,
  formatGuestPriceCurrencyParam,
  parseGuestMaxPrice,
  parseGuestPriceCurrency,
  resolveCampgroundPriceCurrency,
  resolveGuestPriceCurrencyFilter,
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

  it("formats CAD for cards by default", () => {
    assert.equal(formatCampgroundPricePerNight(48, "en-CA"), "$48");
    assert.equal(formatCampgroundPricePerNight(null, "en-CA"), null);
  });

  it("formats USD / MXN when provided", () => {
    assert.equal(formatCampgroundPricePerNight(40, "en-CA", "USD"), "US$40");
    assert.match(
      formatCampgroundPricePerNight(40, "en-CA", "MXN") ?? "",
      /40/,
    );
  });
});

describe("guest price currency", () => {
  it("parses CAD/USD/MXN and rejects junk", () => {
    assert.equal(parseGuestPriceCurrency("cad"), "CAD");
    assert.equal(parseGuestPriceCurrency("USD"), "USD");
    assert.equal(parseGuestPriceCurrency("mxn"), "MXN");
    assert.equal(parseGuestPriceCurrency("EUR"), undefined);
    assert.equal(parseGuestPriceCurrency(""), undefined);
  });

  it("serializes and resolves with CAD default", () => {
    assert.equal(formatGuestPriceCurrencyParam("USD"), "USD");
    assert.equal(resolveCampgroundPriceCurrency(null), GUEST_PRICE_CURRENCY);
    assert.equal(resolveCampgroundPriceCurrency("usd"), "USD");
  });

  it("scopes filter currency only when comparing amounts", () => {
    assert.equal(
      resolveGuestPriceCurrencyFilter({ sort: "name" }),
      undefined,
    );
    assert.equal(
      resolveGuestPriceCurrencyFilter({ maxPrice: 50 }),
      "CAD",
    );
    assert.equal(
      resolveGuestPriceCurrencyFilter({
        maxPrice: 50,
        currency: "USD",
      }),
      "USD",
    );
    assert.equal(
      resolveGuestPriceCurrencyFilter({ sort: "price" }),
      "CAD",
    );
    assert.equal(
      resolveGuestPriceCurrencyFilter({
        sort: "price-desc",
        currency: "MXN",
      }),
      "MXN",
    );
  });
});
