import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const messagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

/** Brand / shared short tokens may match across locales; longer identical copy is a stub smell. */
const IDENTICAL_VALUE_MAX_LEN = 12;

/**
 * Namespaces that currently ship a fr-CA file. Missing en-CA namespaces are
 * intentionally not failures here — issue #2 tracks completing the fr-CA catalogue.
 * Do not treat this list as "fr-CA is complete".
 */
const EXISTING_FR_CA_FILES = ["auth.json", "common.json"] as const;

type LeafMap = Map<string, string>;

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

function placeholderNames(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{(\w+)/g)) {
    names.add(match[1]!);
  }
  return [...names].sort();
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

    it(`${namespace}: keys, placeholders, and non-empty/non-stub values`, () => {
      const enLeaves = collectLeaves(loadNamespace("en-CA", namespace));
      const frLeaves = collectLeaves(loadNamespace("fr-CA", namespace));

      assert.deepEqual([...frLeaves.keys()].sort(), [...enLeaves.keys()].sort());

      for (const [path, enValue] of enLeaves) {
        const frValue = frLeaves.get(path)!;

        assert.notEqual(
          frValue.trim(),
          "",
          `${namespace}.${path}: fr-CA value must be non-empty`,
        );

        assert.deepEqual(
          placeholderNames(frValue),
          placeholderNames(enValue),
          `${namespace}.${path}: ICU placeholder names must match (en=${JSON.stringify(enValue)} fr=${JSON.stringify(frValue)})`,
        );

        if (frValue === enValue && enValue.length > IDENTICAL_VALUE_MAX_LEN) {
          assert.fail(
            `${namespace}.${path}: fr-CA value is byte-identical to en-CA for a longer string — likely an untranslated stub: ${JSON.stringify(enValue)}`,
          );
        }
      }
    });
  }
});
