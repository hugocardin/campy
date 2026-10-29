import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parse,
  TYPE,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";

const messagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

/**
 * Namespaces that currently ship a fr-CA file. Missing en-CA namespaces are
 * intentionally not failures here — issue #2 tracks completing the fr-CA catalogue.
 * Do not treat this list as "fr-CA is complete".
 */
const EXISTING_FR_CA_FILES = ["auth.json", "common.json"] as const;

/**
 * Full `${namespace}.${path}` keys that may legitimately share the same string
 * across en-CA/fr-CA (brand tokens, unchanged loanwords, non-linguistic masks).
 */
const IDENTICAL_VALUE_ALLOWLIST = new Set([
  "common.actions",
  "common.brand",
  "common.logoAlt",
  "auth.form.passwordPlaceholder",
]);

type LeafMap = Map<string, string>;

type PluralInfo = {
  name: string;
  pluralType: NonNullable<Intl.PluralRulesOptions["type"]>;
  /** CLDR categories present (excludes `=N` exact matches) */
  categories: string[];
};

type IcuShape = {
  arguments: string[];
  /** App-defined select branches — must match across locales */
  selectOptions: string[];
  plurals: PluralInfo[];
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

function isExactPluralKey(key: string): boolean {
  return key.startsWith("=");
}

function walkIcu(
  elements: MessageFormatElement[],
  argumentsOut: Set<string>,
  selectOptionsOut: Set<string>,
  pluralsOut: PluralInfo[],
): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        argumentsOut.add(element.value);
        break;
      case TYPE.select: {
        const select = element as SelectElement;
        argumentsOut.add(select.value);
        const keys = Object.keys(select.options).sort();
        selectOptionsOut.add(`${select.value}:${keys.join(",")}`);
        for (const option of Object.values(select.options)) {
          walkIcu(option.value, argumentsOut, selectOptionsOut, pluralsOut);
        }
        break;
      }
      case TYPE.plural: {
        const plural = element as PluralElement;
        argumentsOut.add(plural.value);
        const optionKeys = Object.keys(plural.options);
        pluralsOut.push({
          name: plural.value,
          pluralType: plural.pluralType ?? "cardinal",
          categories: optionKeys.filter((key) => !isExactPluralKey(key)).sort(),
        });
        for (const option of Object.values(plural.options)) {
          walkIcu(option.value, argumentsOut, selectOptionsOut, pluralsOut);
        }
        break;
      }
      case TYPE.tag:
        walkIcu(element.children, argumentsOut, selectOptionsOut, pluralsOut);
        break;
      case TYPE.literal:
      case TYPE.pound:
        break;
      default:
        break;
    }
  }
}

function icuShape(message: string, label: string): IcuShape {
  try {
    const argumentsOut = new Set<string>();
    const selectOptionsOut = new Set<string>();
    const pluralsOut: PluralInfo[] = [];
    walkIcu(parse(message), argumentsOut, selectOptionsOut, pluralsOut);
    return {
      arguments: [...argumentsOut].sort(),
      selectOptions: [...selectOptionsOut].sort(),
      plurals: pluralsOut,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ICU parse failed — ${detail}`, { cause: error });
  }
}

function pluralSignature(plurals: PluralInfo[]): string[] {
  return plurals.map((plural) => `${plural.name}:${plural.pluralType}`).sort();
}

function assertFrPluralCoverage(label: string, plurals: PluralInfo[]): void {
  for (const plural of plurals) {
    assert.ok(
      plural.categories.includes("other"),
      `${label}: plural "${plural.name}" (${plural.pluralType}) must include an "other" branch`,
    );

    const required = new Intl.PluralRules("fr-CA", {
      type: plural.pluralType,
    }).resolvedOptions().pluralCategories;

    for (const category of required) {
      assert.ok(
        plural.categories.includes(category),
        `${label}: plural "${plural.name}" (${plural.pluralType}) missing fr-CA category "${category}" (have: ${plural.categories.join(", ")})`,
      );
    }
  }
}

function assertIcuParity(
  namespace: string,
  path: string,
  enValue: string,
  frValue: string,
): void {
  const label = `${namespace}.${path}`;
  const enShape = icuShape(enValue, `${label} (en-CA)`);
  const frShape = icuShape(frValue, `${label} (fr-CA)`);

  assert.deepEqual(
    frShape.arguments,
    enShape.arguments,
    `${label}: ICU argument names must match (en=${JSON.stringify(enValue)} fr=${JSON.stringify(frValue)})`,
  );

  assert.deepEqual(
    frShape.selectOptions,
    enShape.selectOptions,
    `${label}: select option keys must match exactly across locales`,
  );

  assert.deepEqual(
    pluralSignature(frShape.plurals),
    pluralSignature(enShape.plurals),
    `${label}: plural/selectordinal argument names and pluralType must match`,
  );

  // Plural branches are locale-specific (fr-CA may add `many`, `=N` may differ).
  assertFrPluralCoverage(label, frShape.plurals);
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

        assertIcuParity(namespace, path, enValue, frValue);

        if (
          frTrimmed === enTrimmed &&
          !IDENTICAL_VALUE_ALLOWLIST.has(`${namespace}.${path}`)
        ) {
          assert.fail(
            `${namespace}.${path}: fr-CA value is identical to en-CA after trim — not on the identical-value allowlist: ${JSON.stringify(enTrimmed)}`,
          );
        }
      }
    });
  }
});
