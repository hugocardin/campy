import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const messagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");

function collectKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      return collectKeys(child, path);
    }
    return [path];
  });
}

function loadNamespace(locale: string, namespace: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(messagesRoot, locale, `${namespace}.json`), "utf8"),
  ) as Record<string, unknown>;
}

describe("fr-CA message key parity", () => {
  const frFiles = readdirSync(join(messagesRoot, "fr-CA")).filter((name) =>
    name.endsWith(".json"),
  );

  it("covers every namespace that currently exists for fr-CA", () => {
    assert.deepEqual(frFiles.slice().sort(), ["auth.json", "common.json"]);
  });

  for (const file of frFiles) {
    const namespace = file.replace(/\.json$/, "");

    it(`${namespace}: fr-CA keys match en-CA`, () => {
      const enKeys = collectKeys(loadNamespace("en-CA", namespace)).sort();
      const frKeys = collectKeys(loadNamespace("fr-CA", namespace)).sort();
      assert.deepEqual(frKeys, enKeys);
    });
  }
});
