import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAMPGROUND_CURRENCY_LOCK_SQL_MESSAGES,
  parseCampgroundCurrencyLockError,
} from "./campground-currency-lock";

describe("parseCampgroundCurrencyLockError", () => {
  it("reads EXCEPTION DETAIL first", () => {
    assert.equal(
      parseCampgroundCurrencyLockError({
        message: "noise sites bookings",
        details: "bookings",
      }),
      "bookings",
    );
    assert.equal(
      parseCampgroundCurrencyLockError({
        details: "sites",
      }),
      "sites",
    );
  });

  it("matches pinned SQL message shapes exactly", () => {
    assert.equal(
      parseCampgroundCurrencyLockError({
        message: CAMPGROUND_CURRENCY_LOCK_SQL_MESSAGES.sites,
      }),
      "sites",
    );
    assert.equal(
      parseCampgroundCurrencyLockError({
        message: CAMPGROUND_CURRENCY_LOCK_SQL_MESSAGES.bookings,
      }),
      "bookings",
    );
  });

  it("ignores unrelated check violations", () => {
    assert.equal(
      parseCampgroundCurrencyLockError({
        message: "some other check",
        details: "unrelated",
      }),
      null,
    );
    assert.equal(parseCampgroundCurrencyLockError({}), null);
  });
});
