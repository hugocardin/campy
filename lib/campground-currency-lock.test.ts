import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER,
  parseCampgroundCurrencyLockMessage,
  resolveCampgroundCurrencyLockReason,
} from "./campground-currency-lock";

describe("resolveCampgroundCurrencyLockReason", () => {
  it("locks on sites first, then bookings", () => {
    assert.equal(
      resolveCampgroundCurrencyLockReason({
        hasSites: true,
        hasAmountBookings: true,
      }),
      "sites",
    );
    assert.equal(
      resolveCampgroundCurrencyLockReason({
        hasSites: true,
        hasAmountBookings: false,
      }),
      "sites",
    );
    assert.equal(
      resolveCampgroundCurrencyLockReason({
        hasSites: false,
        hasAmountBookings: true,
      }),
      "bookings",
    );
    assert.equal(
      resolveCampgroundCurrencyLockReason({
        hasSites: false,
        hasAmountBookings: false,
      }),
      null,
    );
  });
});

describe("parseCampgroundCurrencyLockMessage", () => {
  it("maps trigger messages to lock reasons", () => {
    assert.equal(
      parseCampgroundCurrencyLockMessage(
        `${CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER}:sites — has sites`,
      ),
      "sites",
    );
    assert.equal(
      parseCampgroundCurrencyLockMessage(
        `${CAMPGROUND_CURRENCY_LOCK_TRIGGER_MARKER}:bookings — has amount bookings`,
      ),
      "bookings",
    );
    assert.equal(parseCampgroundCurrencyLockMessage("unrelated check"), null);
    assert.equal(parseCampgroundCurrencyLockMessage(null), null);
  });
});
