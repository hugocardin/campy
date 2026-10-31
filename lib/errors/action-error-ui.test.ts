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
  AmenityMissingField,
  getActionErrorId,
  resolveFieldMessage,
  safeTranslationValues,
  translateErrorCode,
  withErrorReference,
  type ErrorTranslator,
} from "./action-error-ui";

const messagesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../messages",
);

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

/**
 * Flatten nested message objects to dotted leaf paths.
 * Non-string, non-plain-object leaves fail loudly (catalogue must stay stringly).
 */
function collectStringLeaves(
  value: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      collectStringLeaves(child, path, out);
    }
    return out;
  }

  if (prefix && typeof value === "string") {
    out[prefix] = value;
    return out;
  }

  assert.fail(
    `${prefix || "(root)"} must be a string or plain object, got ${
      Array.isArray(value) ? "array" : value === null ? "null" : typeof value
    }`,
  );
}

const amenityFieldMessages = {
  [AmenityMissingField.code]: "Amenity Name is required but was not provided.",
  [AmenityMissingField.category]:
    "Category is required but was not provided.",
};

describe("safeTranslationValues", () => {
  it("forwards no details keys (including namespaced field ids)", () => {
    assert.deepEqual(
      safeTranslationValues({
        field: AmenityMissingField.code,
        errorId: "uuid",
        message: "secret path /tmp/x",
        email: "user@example.com",
        hint: "do not show",
      }),
      {},
    );
    assert.deepEqual(
      safeTranslationValues({ field: AmenityMissingField.category }),
      {},
    );
    assert.deepEqual(safeTranslationValues({ field: "id" }), {});
    assert.deepEqual(safeTranslationValues({ message: "leak", errno: 61 }), {});
  });
});

describe("resolveFieldMessage", () => {
  it("returns caller-supplied messages for namespaced fields", () => {
    assert.equal(
      resolveFieldMessage(AmenityMissingField.code, amenityFieldMessages),
      amenityFieldMessages[AmenityMissingField.code],
    );
    assert.equal(
      resolveFieldMessage(AmenityMissingField.category, amenityFieldMessages),
      amenityFieldMessages[AmenityMissingField.category],
    );
  });

  it("returns undefined for unlabeled/internal fields", () => {
    assert.equal(resolveFieldMessage("id", amenityFieldMessages), undefined);
    assert.equal(
      resolveFieldMessage("owner_id", amenityFieldMessages),
      undefined,
    );
    assert.equal(resolveFieldMessage("code", amenityFieldMessages), undefined);
  });

  it("ignores prototype keys and empty-string messages", () => {
    assert.equal(
      resolveFieldMessage("constructor", amenityFieldMessages),
      undefined,
    );
    assert.equal(
      resolveFieldMessage("__proto__", amenityFieldMessages),
      undefined,
    );
    assert.equal(
      resolveFieldMessage("toString", amenityFieldMessages),
      undefined,
    );
    assert.equal(
      resolveFieldMessage(AmenityMissingField.code, {
        [AmenityMissingField.code]: "",
      }),
      undefined,
    );
    assert.equal(
      resolveFieldMessage(AmenityMissingField.code, {
        [AmenityMissingField.code]: "  \n",
      }),
      undefined,
    );
  });
});

describe("translateErrorCode", () => {
  const t = mockTranslator({
    DB_DUPLICATE_VALUE: "This value already exists.",
    COMMON_MISSING_FIELD:
      "A required value was missing. Please check your input and try again.",
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
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "id" }, {
        fieldMessages: amenityFieldMessages,
      }),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("uses caller-supplied form messages for namespaced amenity fields", () => {
    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: AmenityMissingField.code },
        { fieldMessages: amenityFieldMessages },
      ),
      "Amenity Name is required but was not provided.",
    );
    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: AmenityMissingField.category },
        { fieldMessages: amenityFieldMessages },
      ),
      "Category is required but was not provided.",
    );
  });

  it("falls back to generic when no fieldMessages map is provided", () => {
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", {
        field: AmenityMissingField.code,
      }),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("uses caller-supplied too-long messages for namespaced fields", () => {
    const tTooLong = mockTranslator({
      COMMON_FIELD_TOO_LONG:
        "A value is too long. Please shorten it and try again.",
    });
    assert.equal(
      translateErrorCode(
        "COMMON_FIELD_TOO_LONG",
        tTooLong,
        "Error",
        { field: AmenityMissingField.code },
        {
          fieldTooLongMessages: {
            [AmenityMissingField.code]:
              "Amenity Name must be 64 characters or fewer.",
          },
        },
      ),
      "Amenity Name must be 64 characters or fewer.",
    );
    assert.equal(
      translateErrorCode("COMMON_FIELD_TOO_LONG", tTooLong, "Error", {
        field: AmenityMissingField.code,
      }),
      "A value is too long. Please shorten it and try again.",
    );
  });

  it("falls back to generic when the mapped message is empty", () => {
    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: AmenityMissingField.code },
        { fieldMessages: { [AmenityMissingField.code]: "" } },
      ),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("does not interpolate unexpected details keys into the message", () => {
    const message = translateErrorCode(
      "COMMON_MISSING_FIELD",
      t,
      "Error",
      {
        field: "id",
        message: "duplicate key value violates unique constraint",
        email: "admin@example.com",
        hint: "Check RLS",
      },
      { fieldMessages: amenityFieldMessages },
    );
    assert.equal(
      message,
      "A required value was missing. Please check your input and try again.",
    );
    assert.equal(message.includes("duplicate key"), false);
    assert.equal(message.includes("admin@example.com"), false);
    assert.equal(message.includes("RLS"), false);
    assert.equal(message.includes("id is required"), false);
  });

  it("does not leak unexpected keys when a named field message is used", () => {
    const message = translateErrorCode(
      "COMMON_MISSING_FIELD",
      t,
      "Error",
      {
        field: AmenityMissingField.code,
        message: "secret Postgres detail",
        email: "user@example.com",
      },
      { fieldMessages: amenityFieldMessages },
    );
    assert.equal(message, "Amenity Name is required but was not provided.");
    assert.equal(message.includes("secret"), false);
    assert.equal(message.includes("user@example.com"), false);
    assert.equal(message.includes("amenity.code"), false);
  });

  it("ignores prototype field keys even if present on the messages object", () => {
    const sneaky = Object.assign(Object.create({ constructor: "boom" }), {
      [AmenityMissingField.code]:
        "Amenity Name is required but was not provided.",
    }) as Record<string, string>;

    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: "constructor" },
        { fieldMessages: sneaky },
      ),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("falls back when the translator returns a next-intl missing-message key", () => {
    const bad = ((key: string) => `errors.${key}`) as ErrorTranslator;
    bad.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", bad, "Error"),
      "Error",
    );
  });

  it("falls back when the translator throws on the generic catalogue key", () => {
    const bad = ((key: string) => {
      throw new Error(`INVALID_MESSAGE: ${key}`);
    }) as ErrorTranslator;
    bad.has = () => true;
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", bad, "Error", { field: "id" }),
      "Error",
    );
  });

  it("falls back when a catalogue entry leaves an unsubstituted {placeholder}", () => {
    const withFieldPlaceholder = mockTranslator({
      DB_DUPLICATE_VALUE: "{field} already exists.",
      COMMON_MISSING_FIELD:
        "A required value was missing. Please check your input and try again.",
    });
    const message = translateErrorCode(
      "DB_DUPLICATE_VALUE",
      withFieldPlaceholder,
      "Error",
      { field: AmenityMissingField.code },
      { fieldMessages: amenityFieldMessages },
    );
    assert.equal(message, "Error");
    assert.equal(message.includes("{"), false);
    assert.equal(message.includes("amenity.code"), false);
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

describe("amenity form label reuse", () => {
  it("required/too-long messages equal visible form labels + fixed en-CA wording", () => {
    const amenities = JSON.parse(
      readFileSync(join(messagesRoot, "en-CA/amenities.json"), "utf8"),
    ) as {
      form: { amenityLabel: string };
      errors: {
        codeRequired: string;
        categoryRequired: string;
        codeTooLong: string;
      };
    };
    const amenityCategories = JSON.parse(
      readFileSync(join(messagesRoot, "en-CA/amenityCategories.json"), "utf8"),
    ) as { form: { categoryLabel: string } };

    assert.equal(
      amenities.errors.codeRequired,
      `${amenities.form.amenityLabel} is required but was not provided.`,
    );
    assert.equal(
      amenities.errors.categoryRequired,
      `${amenityCategories.form.categoryLabel} is required but was not provided.`,
    );
    assert.equal(
      amenities.errors.codeTooLong,
      `${amenities.form.amenityLabel} must be 64 characters or fewer.`,
    );
  });
});

describe("en-CA errors catalogue", () => {
  it("formats every key via createTranslator without malformed ICU", () => {
    const errorsPath = join(messagesRoot, "en-CA/errors.json");
    const errors = JSON.parse(readFileSync(errorsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const leaves = collectStringLeaves(errors);

    // Flat code→message map: no nested objects (e.g. former fields.*).
    for (const key of Object.keys(errors)) {
      assert.equal(
        typeof errors[key],
        "string",
        `errors.${key} must be a flat string (got ${typeof errors[key]})`,
      );
    }

    const t = createTranslator({
      locale: "en-CA",
      messages: { errors },
      namespace: "errors",
    });

    for (const [key, pattern] of Object.entries(leaves)) {
      const elements = parse(pattern);
      const argNames = [...collectArgumentNames(elements)];
      // Flat errors.* must stay argument-free: INTERPOLATABLE_DETAIL_KEYS is
      // empty, so nothing could ever fill an ICU placeholder.
      assert.deepEqual(
        argNames,
        [],
        `errors.${key} must not contain ICU arguments (have: ${argNames.join(", ")})`,
      );

      const message = t(key);

      assert.ok(message.length > 0, `${key} produced an empty message`);
      assert.equal(message.includes("{"), false, `${key} left a '{' in output`);
      assert.notEqual(
        message,
        `errors.${key}`,
        `${key} fell back to missing-message key (likely invalid ICU)`,
      );
      assert.notEqual(message, key, `${key} returned the bare key`);
    }
  });

  it("fails loudly when a catalogue leaf is not a string", () => {
    assert.throws(
      () => collectStringLeaves({ DB_DUPLICATE_VALUE: null }),
      /DB_DUPLICATE_VALUE must be a string/,
    );
    assert.throws(
      () => collectStringLeaves({ fields: { code: ["Amenity Name"] } }),
      /fields\.code must be a string/,
    );
  });

  it("maps COMMON_MISSING_FIELD through amenity form messages", () => {
    const errors = JSON.parse(
      readFileSync(join(messagesRoot, "en-CA/errors.json"), "utf8"),
    ) as Record<string, unknown>;
    const amenities = JSON.parse(
      readFileSync(join(messagesRoot, "en-CA/amenities.json"), "utf8"),
    ) as {
      form: { amenityLabel: string };
      errors: { codeRequired: string; categoryRequired: string };
    };
    const amenityCategories = JSON.parse(
      readFileSync(join(messagesRoot, "en-CA/amenityCategories.json"), "utf8"),
    ) as { form: { categoryLabel: string } };

    const t = createTranslator({
      locale: "en-CA",
      messages: { errors },
      namespace: "errors",
    }) as ErrorTranslator;

    const fieldMessages = {
      [AmenityMissingField.code]: amenities.errors.codeRequired,
      [AmenityMissingField.category]: amenities.errors.categoryRequired,
    };

    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: AmenityMissingField.code },
        { fieldMessages },
      ),
      amenities.errors.codeRequired,
    );
    assert.equal(
      translateErrorCode(
        "COMMON_MISSING_FIELD",
        t,
        "Error",
        { field: AmenityMissingField.category },
        { fieldMessages },
      ),
      amenities.errors.categoryRequired,
    );
    assert.equal(
      amenities.errors.codeRequired,
      `${amenities.form.amenityLabel} is required but was not provided.`,
    );
    assert.equal(
      amenities.errors.categoryRequired,
      `${amenityCategories.form.categoryLabel} is required but was not provided.`,
    );
    assert.equal(
      translateErrorCode("COMMON_MISSING_FIELD", t, "Error", { field: "id" }, {
        fieldMessages,
      }),
      "A required value was missing. Please check your input and try again.",
    );
  });

  it("createTranslator unsubstituted {field} falls back (never shows amenity.code)", () => {
    const t = createTranslator({
      locale: "en-CA",
      messages: {
        errors: {
          DB_DUPLICATE_VALUE: "{field} already exists.",
        },
      },
      namespace: "errors",
    }) as ErrorTranslator;

    const message = translateErrorCode(
      "DB_DUPLICATE_VALUE",
      t,
      "Error",
      { field: AmenityMissingField.code },
      { fieldMessages: amenityFieldMessages },
    );
    assert.equal(message, "Error");
    assert.equal(message.includes("{"), false);
    assert.equal(message.includes("amenity.code"), false);
  });
});
