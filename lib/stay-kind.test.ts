import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseStayKind,
  stayKindAllowsRigLength,
} from "./stay-kind";

describe("stay-kind", () => {
  it("parses camping / lodging", () => {
    assert.equal(parseStayKind("camping"), "camping");
    assert.equal(parseStayKind("LODGING"), "lodging");
    assert.equal(parseStayKind("cabin"), undefined);
    assert.equal(parseStayKind(""), undefined);
  });

  it("gates rig length for lodging searches", () => {
    assert.equal(stayKindAllowsRigLength(undefined), true);
    assert.equal(stayKindAllowsRigLength("camping"), true);
    assert.equal(stayKindAllowsRigLength("lodging"), false);
  });
});
