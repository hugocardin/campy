import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDrivewayUrlParam,
  parseDrivewayType,
  parseDrivewayTypeInput,
  parseDrivewayUrlParam,
} from "./driveway-type";

describe("driveway-type", () => {
  it("parses DB / admin values", () => {
    assert.equal(parseDrivewayType("PULL_THROUGH"), "PULL_THROUGH");
    assert.equal(parseDrivewayType("back_in"), "BACK_IN");
    assert.equal(parseDrivewayType(null), null);
    assert.equal(parseDrivewayType(""), null);
    assert.equal(parseDrivewayType("side"), undefined);
  });

  it("parses strict admin input", () => {
    assert.deepEqual(parseDrivewayTypeInput(undefined), {
      ok: true,
      drivewayType: null,
    });
    assert.deepEqual(parseDrivewayTypeInput("BACK_IN"), {
      ok: true,
      drivewayType: "BACK_IN",
    });
    assert.deepEqual(parseDrivewayTypeInput("nope"), {
      ok: false,
      reason: "invalid",
    });
  });

  it("round-trips URL tokens", () => {
    assert.equal(parseDrivewayUrlParam("pull_through"), "PULL_THROUGH");
    assert.equal(parseDrivewayUrlParam("back_in"), "BACK_IN");
    // Uppercase DB form lowercases to the URL token — accepted.
    assert.equal(parseDrivewayUrlParam("PULL_THROUGH"), "PULL_THROUGH");
    assert.equal(parseDrivewayUrlParam("side"), undefined);
    assert.equal(formatDrivewayUrlParam("PULL_THROUGH"), "pull_through");
    assert.equal(formatDrivewayUrlParam(null), undefined);
  });
});
