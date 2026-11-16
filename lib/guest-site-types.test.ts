import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGuestSiteTypesParam,
  normalizeGuestSiteTypes,
  parseGuestSiteTypes,
  siteTypesForStayKind,
} from "./guest-site-types";

describe("parseGuestSiteTypes / format", () => {
  it("parses comma-separated codes case-insensitively", () => {
    assert.deepEqual(parseGuestSiteTypes("tent,RV,lodging"), [
      "TENT",
      "RV",
      "LODGING",
    ]);
    assert.deepEqual(parseGuestSiteTypes("rv_and_tent,nope"), ["RV_AND_TENT"]);
    assert.deepEqual(parseGuestSiteTypes(""), []);
    assert.deepEqual(parseGuestSiteTypes(undefined), []);
  });

  it("stable-orders and dedupes", () => {
    assert.deepEqual(normalizeGuestSiteTypes(["LODGING", "TENT", "TENT", "RV"]), [
      "TENT",
      "RV",
      "LODGING",
    ]);
    assert.equal(formatGuestSiteTypesParam(["RV", "TENT"]), "tent,rv");
    assert.equal(formatGuestSiteTypesParam([]), undefined);
  });
});

describe("siteTypesForStayKind", () => {
  it("drops lodging types when stay=camping and camping when lodging", () => {
    assert.deepEqual(
      siteTypesForStayKind(["TENT", "LODGING", "RV"], "camping"),
      ["TENT", "RV"],
    );
    assert.deepEqual(
      siteTypesForStayKind(["TENT", "LODGING", "RV"], "lodging"),
      ["LODGING"],
    );
    assert.deepEqual(
      siteTypesForStayKind(["TENT", "LODGING"], undefined),
      ["TENT", "LODGING"],
    );
  });
});
