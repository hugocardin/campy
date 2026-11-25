import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOOKING_STATUS_NAMES,
  isBookingStatusName,
  parseBookingStatusName,
} from "@/lib/booking-status";

describe("BOOKING_STATUS_NAMES", () => {
  it("is the MVP four-status set", () => {
    assert.deepEqual([...BOOKING_STATUS_NAMES], [
      "pending",
      "confirmed",
      "cancelled",
      "refunded",
    ]);
  });
});

describe("isBookingStatusName", () => {
  it("accepts known names", () => {
    for (const name of BOOKING_STATUS_NAMES) {
      assert.equal(isBookingStatusName(name), true);
    }
  });

  it("rejects unknown names", () => {
    assert.equal(isBookingStatusName("completed"), false);
    assert.equal(isBookingStatusName("Pending"), false);
  });
});

describe("parseBookingStatusName", () => {
  it("trims and lowercases", () => {
    assert.equal(parseBookingStatusName(" Confirmed "), "confirmed");
  });

  it("returns undefined for junk", () => {
    assert.equal(parseBookingStatusName(null), undefined);
    assert.equal(parseBookingStatusName(2), undefined);
    assert.equal(parseBookingStatusName("payment_failed"), undefined);
  });
});
