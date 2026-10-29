import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import {
  getActionErrorId,
  translateErrorCode,
  withErrorReference,
  type ErrorTranslator,
} from "./action-error-ui";

function mockTranslator(
  messages: Record<string, string>,
): ErrorTranslator {
  const t = ((
    key: string,
    values?: Record<string, string | number | Date>,
  ) => {
    let msg = messages[key] ?? key;
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        msg = msg.replaceAll(`{${name}}`, String(value));
      }
    }
    return msg;
  }) as ErrorTranslator;
  t.has = (key: string) => Object.prototype.hasOwnProperty.call(messages, key);
  return t;
}

function collectArgumentNames(
  elements: MessageFormatElement[],
  into = new Set<string>(),
): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.argument || el.type === TYPE.plural || el.type === TYPE.select) {
      into.add(el.value);
    }
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      for (const option of Object.values(el.options)) {
        collectArgumentNames(option.value, into);
      }
    }
  }
  return into;
}

describe("translateErrorCode", () => {
  it("translates known codes and falls back otherwise", () => {
    const t = mockTranslator({
      DB_DUPLICATE_VALUE: "This value already exists.",
      COMMON_MISSING_FIELD: "{field} is required but was not provided.",
    });
    assert.equal(
      translateErrorCode("DB_DUPLICATE_VALUE", t, "Error"),
      "This value already exists.",
    );
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "id" }),
      "id is required but was not provided.",
    );
    assert.equal(translateErrorCode("DB_UNKNOWN", t, "Error"), "Error");
    assert.equal(translateErrorCode(undefined, t, "Error"), "Error");
  });

  it("falls back when the translator returns a next-intl missing-message key", () => {
    const t = ((key: string) => `errors.${key}`) as ErrorTranslator;
    t.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error"),
      "Error",
    );
  });

  it("falls back when the translator throws", () => {
    const t = ((key: string) => {
      throw new Error(`INVALID_MESSAGE: ${key}`);
    }) as ErrorTranslator;
    t.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error"),
      "Error",
    );
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

describe("en-CA errors catalogue", () => {
  it("formats every key via createTranslator without malformed ICU", () => {
    const errorsPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../messages/en-CA/errors.json",
    );
    const errors = JSON.parse(readFileSync(errorsPath, "utf8")) as Record<
      string,
      string
    >;

    const t = createTranslator({
      locale: "en-CA",
      messages: { errors },
      namespace: "errors",
    });

    for (const [key, pattern] of Object.entries(errors)) {
      const elements = parse(pattern);
      const argNames = [...collectArgumentNames(elements)];
      const values: Record<string, string> = {};
      for (const name of argNames) {
        values[name] = name === "field" ? "id" : "sample";
      }

      const message =
        argNames.length > 0 ? t(key, values) : t(key);

      assert.ok(message.length > 0, `${key} produced an empty message`);
      assert.notEqual(
        message,
        `errors.${key}`,
        `${key} fell back to missing-message key (likely invalid ICU)`,
      );
      assert.notEqual(message, key, `${key} returned the bare key`);
    }
  });
});
