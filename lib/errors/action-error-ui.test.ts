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
  resolveFieldLabel,
  safeTranslationValues,
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

/** Flatten nested message objects to dotted leaf paths (string values only). */
function collectStringLeaves(
  value: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix && typeof value === "string") {
      out[prefix] = value;
    }
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    collectStringLeaves(child, path, out);
  }
  return out;
}

describe("safeTranslationValues", () => {
  it("allowlists only labeled field values and drops unexpected keys", () => {
    assert.deepEqual(
      safeTranslationValues({
        field: "code",
        errorId: "uuid",
        message: "secret path /tmp/x",
        email: "user@example.com",
        hint: "do not show",
      }),
      { field: "code" },
    );
    assert.deepEqual(safeTranslationValues({ field: "category" }), {
      field: "category",
    });
    assert.deepEqual(safeTranslationValues({ field: "id" }), {});
    assert.deepEqual(
      safeTranslationValues({ message: "leak", errno: 61 }),
      {},
    );
  });
});

describe("resolveFieldLabel", () => {
  const t = mockTranslator({
    "fields.code": "Amenity Name",
    "fields.category": "Category",
  });

  it("maps allowlisted field keys to translated form labels", () => {
    assert.equal(resolveFieldLabel("code", t), "Amenity Name");
    assert.equal(resolveFieldLabel("category", t), "Category");
  });

  it("returns undefined for unlabeled/internal fields", () => {
    assert.equal(resolveFieldLabel("id", t), undefined);
    assert.equal(resolveFieldLabel("owner_id", t), undefined);
  });
});

describe("translateErrorCode", () => {
  const t = mockTranslator({
    DB_DUPLICATE_VALUE: "This value already exists.",
    COMMON_MISSING_FIELD:
      "A required value was missing. Please check your input and try again.",
    COMMON_MISSING_NAMED_FIELD: "{field} is required but was not provided.",
    "fields.code": "Amenity Name",
    "fields.category": "Category",
  });

  it("translates known codes and falls back otherwise", () => {
    assert.equal(
      translateErrorCode("DB_DUPLICATE_VALUE", t, "Error"),
      "This value already exists.",
    );
    assert.equal(translateErrorCode("DB_UNKNOWN", t, "Error"), "Error");
    assert.equal(translateErrorCode(undefined, t, "Error"), "Error");
  });

  it("uses a generic message for internal fields like id", () => {
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "id" }),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("interpolates translated form labels, not raw column names", () => {
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
        field: "code",
      }),
      "Amenity Name is required but was not provided.",
    );
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
        field: "category",
      }),
      "Category is required but was not provided.",
    );
  });

  it("falls back to generic when a labeled field has no catalogue entry", () => {
    const noLabels = mockTranslator({
      COMMON_MISSING_FIELD:
        "A required value was missing. Please check your input and try again.",
      COMMON_MISSING_NAMED_FIELD: "{field} is required but was not provided.",
    });
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", noLabels, "Error", {
        field: "code",
      }),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("does not interpolate unexpected details keys into the message", () => {
    const message = translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
      field: "id",
      message: "duplicate key value violates unique constraint",
      email: "admin@example.com",
      hint: "Check RLS",
    });
    assert.equal(
      message,
      "A required value was missing. Please check your input and try again.",
    );
    assert.equal(message.includes("duplicate key"), false);
    assert.equal(message.includes("admin@example.com"), false);
    assert.equal(message.includes("RLS"), false);
    assert.equal(message.includes("id is required"), false);
  });

  it("does not interpolate unexpected keys even when field is labeled", () => {
    const message = translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
      field: "code",
      message: "secret Postgres detail",
      email: "user@example.com",
    });
    assert.equal(message, "Amenity Name is required but was not provided.");
    assert.equal(message.includes("secret"), false);
    assert.equal(message.includes("user@example.com"), false);
    assert.equal(message.includes("code is required"), false);
  });

  it("falls back when the translator returns a next-intl missing-message key", () => {
    const bad = ((key: string) => `errors.${key}`) as ErrorTranslator;
    bad.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", bad, "Error"),
      "Error",
    );
  });

  it("falls back when the translator throws", () => {
    const bad = ((key: string) => {
      throw new Error(`INVALID_MESSAGE: ${key}`);
    }) as ErrorTranslator;
    bad.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", bad, "Error"),
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
      unknown
    >;
    const leaves = collectStringLeaves(errors);

    const t = createTranslator({
      locale: "en-CA",
      messages: { errors },
      namespace: "errors",
    });

    for (const [key, pattern] of Object.entries(leaves)) {
      const elements = parse(pattern);
      const argNames = [...collectArgumentNames(elements)];
      const values: Record<string, string> = {};
      for (const name of argNames) {
        values[name] = name === "field" ? "Amenity Name" : "sample";
      }

      const message = argNames.length > 0 ? t(key, values) : t(key);

      assert.ok(message.length > 0, `${key} produced an empty message`);
      assert.notEqual(
        message,
        `errors.${key}`,
        `${key} fell back to missing-message key (likely invalid ICU)`,
      );
      assert.notEqual(message, key, `${key} returned the bare key`);
    }
  });

  it("maps COMMON_MISSING_FIELD through real form labels via createTranslator", () => {
    const errorsPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../messages/en-CA/errors.json",
    );
    const errors = JSON.parse(readFileSync(errorsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const t = createTranslator({
      locale: "en-CA",
      messages: { errors },
      namespace: "errors",
    }) as ErrorTranslator;

    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "code" }),
      "Amenity Name is required but was not provided.",
    );
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
        field: "category",
      }),
      "Category is required but was not provided.",
    );
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "id" }),
      "A required value was missing. Please check your input and try again.",
    );
  });
});
