import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

const messagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

/**
 * Namespaces that currently ship a fr-CA file. Missing en-CA namespaces are
 * intentionally not failures here — issue #2 tracks completing the fr-CA catalogue.
 * Do not treat this list as "fr-CA is complete".
 */
const EXISTING_FR_CA_FILES = ["auth.json", "common.json"] as const;

/**
 * Keys (dot paths) that may legitimately share the same string across en-CA/fr-CA
 * (brand tokens, unchanged loanwords, non-linguistic placeholders).
 */
const IDENTICAL_VALUE_ALLOWLIST = new Set([
  "actions",
  "brand",
  "logoAlt",
  "form.passwordPlaceholder",
]);

type LeafMap = Map<string, string>;

type IcuShape = {
  arguments: string[];
  /** `${argumentName}:${optionKey}` for plural/select branches */
  optionKeys: string[];
};

function collectLeaves(value: unknown, prefix = "", out: LeafMap = new Map()): LeafMap {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) {
      assert.equal(
        typeof value,
        "string",
        `expected string leaf at ${prefix}, got ${typeof value}`,
      );
      out.set(prefix, value as string);
    }
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    collectLeaves(child, path, out);
  }
  return out;
}

function walkIcu(
  elements: MessageFormatElement[],
  argumentsOut: Set<string>,
  optionKeysOut: Set<string>,
): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        argumentsOut.add(element.value);
        break;
      case TYPE.plural:
      case TYPE.select:
        argumentsOut.add(element.value);
        for (const [optionKey, option] of Object.entries(element.options)) {
          optionKeysOut.add(`${element.value}:${optionKey}`);
          walkIcu(option.value, argumentsOut, optionKeysOut);
        }
        break;
      case TYPE.tag:
        walkIcu(element.children, argumentsOut, optionKeysOut);
        break;
      case TYPE.literal:
      case TYPE.pound:
        break;
      default:
        break;
    }
  }
}

function icuShape(message: string): IcuShape {
  const argumentsOut = new Set<string>();
  const optionKeysOut = new Set<string>();
  walkIcu(parse(message), argumentsOut, optionKeysOut);
  return {
    arguments: [...argumentsOut].sort(),
    optionKeys: [...optionKeysOut].sort(),
  };
}

function loadNamespace(locale: string, namespace: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(messagesRoot, locale, `${namespace}.json`), "utf8"),
  ) as Record<string, unknown>;
}

describe("fr-CA message parity (existing namespaces only)", () => {
  const frFiles = readdirSync(join(messagesRoot, "fr-CA"))
    .filter((name) => name.endsWith(".json"))
    .sort();

  it("documents which fr-CA namespaces exist (missing ones are issue #2, not failures)", () => {
    assert.deepEqual(frFiles, [...EXISTING_FR_CA_FILES]);
  });

  for (const file of EXISTING_FR_CA_FILES) {
    const namespace = file.replace(/\.json$/, "");

    it(`${namespace}: keys, ICU shape, and non-empty/non-stub values`, () => {
      const enLeaves = collectLeaves(loadNamespace("en-CA", namespace));
      const frLeaves = collectLeaves(loadNamespace("fr-CA", namespace));

      assert.deepEqual([...frLeaves.keys()].sort(), [...enLeaves.keys()].sort());

      for (const [path, enValue] of enLeaves) {
        const frValue = frLeaves.get(path)!;
        const enTrimmed = enValue.trim();
        const frTrimmed = frValue.trim();

        assert.notEqual(
          frTrimmed,
          "",
          `${namespace}.${path}: fr-CA value must be non-empty`,
        );

        assert.deepEqual(
          icuShape(frValue),
          icuShape(enValue),
          `${namespace}.${path}: ICU argument names and plural/select option keys must match (en=${JSON.stringify(enValue)} fr=${JSON.stringify(frValue)})`,
        );

        if (
          frTrimmed === enTrimmed &&
          !IDENTICAL_VALUE_ALLOWLIST.has(path)
        ) {
          assert.fail(
            `${namespace}.${path}: fr-CA value is identical to en-CA after trim — not on the identical-value allowlist: ${JSON.stringify(enTrimmed)}`,
          );
        }
      }
    });
  }
});
