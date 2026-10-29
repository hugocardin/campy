import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getActionErrorId,
  translateErrorCode,
  withErrorReference,
  type ErrorTranslator,
} from "./action-error-ui";

function mockTranslator(
  messages: Record<string, string>,
): ErrorTranslator {
  const t = ((key: string) => messages[key] ?? key) as ErrorTranslator;
  t.has = (key: string) => Object.prototype.hasOwnProperty.call(messages, key);
  return t;
}

describe("translateErrorCode", () => {
  it("translates known codes and falls back otherwise", () => {
    const t = mockTranslator({
      DB_DUPLICATE_VALUE: "This value already exists.",
    });
    assert.equal(
      translateErrorCode("DB_DUPLICATE_VALUE", t, "Error"),
      "This value already exists.",
    );
    assert.equal(translateErrorCode("DB_UNKNOWN", t, "Error"), "Error");
    assert.equal(translateErrorCode(undefined, t, "Error"), "Error");
  });
});

describe("withErrorReference", () => {
  it("appends a reference line only when errorId is present", () => {
    assert.equal(
      withErrorReference("Oops", { errorId: "abc" }, (id) => `Ref: ${id}`),
      "Oops\nRef: abc",
    );
    assert.equal(withErrorReference("Oops", {}, (id) => `Ref: ${id}`), "Oops");
    assert.equal(getActionErrorId({ errorId: "abc" }), "abc");
    assert.equal(getActionErrorId({}), undefined);
  });
});
