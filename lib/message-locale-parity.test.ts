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

/**
 * Expected fr-CA plural categories (CLDR 38+). Cardinal `many` covers large round
 * numbers (e.g. 1_000_000) and is required so translators don't rely on silent
 * fallback to `other`. Hardcoded (not read solely from the runtime) so a
 * small-icu / older Node build can't quietly weaken the catalogue check —
 * `assertRuntimePluralRulesAgree` fails loudly if Intl disagrees.
 */
const FR_CA_PLURAL_CATEGORIES = {
  cardinal: ["many", "one", "other"],
  ordinal: ["one", "other"],
} as const;

type LeafMap = Map<string, string>;

type PluralInfo = {
  /** Structural path (`select:arg:option` / `plural:arg:option` chain + this plural) */
  structuralPath: string;
  name: string;
  pluralType: NonNullable<Intl.PluralRulesOptions["type"]>;
  /** CLDR categories present (excludes `=N` exact matches) */
  categories: string[];
  /** Exact-match branches like `=0` */
  exactKeys: string[];
  /** Sorted arg names used in the `other` branch (deep). */
  otherArgs: string[];
  /**
   * Sorted arg names per non-`other` category branch (deep). Compared as
   * category ⊆ other in the same locale. `#` and the enclosing plural's own
   * variable (e.g. `{count}` in a `count` plural) are not args.
   */
  categoryArgs: Record<string, string[]>;
  /** Sorted arg names per `=N` exact branch (deep), same omit rules. */
  exactArgs: Record<string, string[]>;
};

type IcuShape = {
  arguments: string[];
  /** App-defined select branches — must match across locales */
  selectOptions: string[];
  plurals: PluralInfo[];
  /**
   * Nested plurals under locale-only category bodies (`many`/`few`/`two`/`zero`).
   * Not paired across locales; only fed to `assertFrPluralCoverage` (and
   * same-locale category-vs-other arg checks).
   */
  coveragePlurals: PluralInfo[];
};

/** Categories that differ by locale; nests under them are not structural. */
const LOCALE_ONLY_PLURAL_CATEGORIES = new Set([
  "many",
  "few",
  "two",
  "zero",
]);

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

function joinPath(parentPath: string, segment: string): string {
  return parentPath ? `${parentPath}/${segment}` : segment;
}

/**
 * Collect interpolation placeholders (argument / number / date / time) from an
 * element tree, including every select/plural branch. Used for same-locale
 * category-vs-`other` and cross-locale arg checks (`#` / pound is not an arg).
 *
 * `omitNames` drops plural variables so `{count}` / `{guests}` are treated like
 * `#` *inside their own options*. Nested plurals still count their binding as
 * an arg of the enclosing category (so dropping a whole nested plural is
 * visible), then omit that name while visiting their options. Select bindings
 * are always counted (unless omitted by an outer plural of the same name).
 */
function collectInterpolationArgsDeep(
  elements: MessageFormatElement[],
  omitNames: ReadonlySet<string> = new Set(),
): string[] {
  const args = new Set<string>();

  function visit(
    nodes: MessageFormatElement[],
    omit: ReadonlySet<string>,
  ): void {
    for (const element of nodes) {
      switch (element.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          if (!omit.has(element.value)) {
            args.add(element.value);
          }
          break;
        case TYPE.plural: {
          const plural = element as PluralElement;
          // Binding is an arg of the *enclosing* category unless omitted.
          if (!omit.has(plural.value)) {
            args.add(plural.value);
          }
          const nestedOmit = new Set(omit);
          nestedOmit.add(plural.value);
          for (const option of Object.values(plural.options)) {
            visit(option.value, nestedOmit);
          }
          break;
        }
        case TYPE.select: {
          const select = element as SelectElement;
          if (!omit.has(select.value)) {
            args.add(select.value);
          }
          for (const option of Object.values(select.options)) {
            visit(option.value, omit);
          }
          break;
        }
        case TYPE.tag:
          visit(element.children, omit);
          break;
        case TYPE.literal:
        case TYPE.pound:
          break;
        default:
          break;
      }
    }
  }

  visit(elements, omitNames);
  return [...args].sort();
}

/**
 * CLDR plural categories vary by locale (fr-CA adds `many`). Nested ICU under
 * locale-only category bodies (`many`/`few`/`two`/`zero`) must not create
 * required structural paths. `one` is shared by en-CA and fr-CA, so nests under
 * it use a shared `:one` segment (like `other`'s `:category`).
 *
 * Structural paths are recorded for: this plural, nests under `other`
 * (`:category`), nests under `one` (`:one`), and nests under `=N`. Path compare
 * is one-way (every en path ⊆ fr); extra fr paths are allowed when *any*
 * `=N` in the chain is fr-only per the en plural's `exactKeys` at the path
 * before that segment (plain en `=0` text still marks `=0` as shared).
 * Locale-only nests go to `coveragePlurals` for coverage asserts, with a real
 * parent path including the `:many` (etc.) segment.
 *
 * Sibling `#n` indices follow encounter order under a parent; keep the same
 * relative order of same-signature sibling plurals across locales.
 */
function walkIcu(
  elements: MessageFormatElement[],
  argumentsOut: Set<string>,
  selectOptionsOut: Set<string>,
  pluralsOut: PluralInfo[],
  coveragePluralsOut: PluralInfo[],
  parentPath = "",
  siblingCounters: Map<string, number> = new Map(),
  recordStructuralPaths = true,
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
        for (const [optionKey, option] of Object.entries(select.options)) {
          walkIcu(
            option.value,
            argumentsOut,
            selectOptionsOut,
            pluralsOut,
            coveragePluralsOut,
            recordStructuralPaths
              ? joinPath(parentPath, `select:${select.value}:${optionKey}`)
              : parentPath,
            siblingCounters,
            recordStructuralPaths,
          );
        }
        break;
      }
      case TYPE.plural: {
        const plural = element as PluralElement;
        const pluralType = plural.pluralType ?? "cardinal";
        argumentsOut.add(plural.value);
        const optionKeys = Object.keys(plural.options);
        const baseSegment = `plural:${plural.value}:${pluralType}`;
        let structuralPath = parentPath;

        const otherOption = plural.options.other;
        const omitOuter = new Set([plural.value]);
        const otherArgs = otherOption
          ? collectInterpolationArgsDeep(otherOption.value, omitOuter)
          : [];
        const categoryArgs: Record<string, string[]> = {};
        const exactArgs: Record<string, string[]> = {};
        for (const [optionKey, option] of Object.entries(plural.options)) {
          if (optionKey === "other") continue;
          const branchArgs = collectInterpolationArgsDeep(
            option.value,
            omitOuter,
          );
          if (isExactPluralKey(optionKey)) {
            exactArgs[optionKey] = branchArgs;
          } else {
            categoryArgs[optionKey] = branchArgs;
          }
        }

        if (recordStructuralPaths) {
          const siblingKey = `${parentPath}\0${baseSegment}`;
          const siblingIndex = siblingCounters.get(siblingKey) ?? 0;
          siblingCounters.set(siblingKey, siblingIndex + 1);
          structuralPath = joinPath(parentPath, `${baseSegment}#${siblingIndex}`);
          pluralsOut.push({
            structuralPath,
            name: plural.value,
            pluralType,
            categories: optionKeys
              .filter((key) => !isExactPluralKey(key))
              .sort(),
            exactKeys: optionKeys.filter(isExactPluralKey).sort(),
            otherArgs,
            categoryArgs,
            exactArgs,
          });
        }

        for (const [optionKey, option] of Object.entries(plural.options)) {
          if (isExactPluralKey(optionKey)) {
            walkIcu(
              option.value,
              argumentsOut,
              selectOptionsOut,
              pluralsOut,
              coveragePluralsOut,
              recordStructuralPaths
                ? joinPath(
                    structuralPath,
                    `plural:${plural.value}:${optionKey}`,
                  )
                : parentPath,
              siblingCounters,
              recordStructuralPaths,
            );
            continue;
          }

          if (optionKey === "other") {
            walkIcu(
              option.value,
              argumentsOut,
              selectOptionsOut,
              pluralsOut,
              coveragePluralsOut,
              recordStructuralPaths
                ? joinPath(
                    structuralPath,
                    `plural:${plural.value}:category`,
                  )
                : parentPath,
              siblingCounters,
              recordStructuralPaths,
            );
            continue;
          }

          // Shared across en-CA / fr-CA cardinal + ordinal rules.
          if (optionKey === "one") {
            walkIcu(
              option.value,
              argumentsOut,
              selectOptionsOut,
              pluralsOut,
              coveragePluralsOut,
              recordStructuralPaths
                ? joinPath(structuralPath, `plural:${plural.value}:one`)
                : parentPath,
              siblingCounters,
              recordStructuralPaths,
            );
            continue;
          }

          // Locale-only categories (`many` / `few` / `two` / `zero`): always
          // collect arguments + selects; nested plurals go to coverage-only
          // (fr category coverage). Keep a real parent path (including
          // `:many` etc.) so failure messages stay attributable; fresh
          // sibling counters so coverage nests don't shift paired indices.
          if (LOCALE_ONLY_PLURAL_CATEGORIES.has(optionKey)) {
            walkIcu(
              option.value,
              argumentsOut,
              selectOptionsOut,
              coveragePluralsOut,
              coveragePluralsOut,
              joinPath(
                structuralPath,
                `plural:${plural.value}:${optionKey}`,
              ),
              new Map(),
              true,
            );
            continue;
          }

          // Unknown category: collect args/selects, no structural paths.
          walkIcu(
            option.value,
            argumentsOut,
            selectOptionsOut,
            pluralsOut,
            coveragePluralsOut,
            parentPath,
            siblingCounters,
            false,
          );
        }
        break;
      }
      case TYPE.tag:
        walkIcu(
          element.children,
          argumentsOut,
          selectOptionsOut,
          pluralsOut,
          coveragePluralsOut,
          parentPath,
          siblingCounters,
          recordStructuralPaths,
        );
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
    const coveragePluralsOut: PluralInfo[] = [];
    walkIcu(
      parse(message),
      argumentsOut,
      selectOptionsOut,
      pluralsOut,
      coveragePluralsOut,
    );
    return {
      arguments: [...argumentsOut].sort(),
      selectOptions: [...selectOptionsOut].sort(),
      plurals: pluralsOut,
      coveragePlurals: coveragePluralsOut,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ICU parse failed — ${detail}`, { cause: error });
  }
}

/**
 * Exact key from a path segment like `plural:count:=0` / `plural:x:=1.5`.
 * Uses the same `=`-prefix rule as `isExactPluralKey` so non-integer exact
 * keys cannot drift from walk/path recording.
 */
function exactKeyFromSegment(segment: string): string | null {
  const colon = segment.lastIndexOf(":");
  if (colon < 0 || !segment.startsWith("plural:")) return null;
  const tail = segment.slice(colon + 1);
  return isExactPluralKey(tail) ? tail : null;
}

/**
 * Extra fr paths are legitimate when any `=N` segment in the chain is fr-only:
 * the en plural at the structural path *before* that segment is missing or
 * does not list the `=N` in `exactKeys`. Plain en `=0` text still marks `=0`
 * as shared (no nested path required). Extras under `other` / `one` / shared
 * selects (no `=N`) fail.
 */
function isAllowedExtraFrPath(
  frPath: string,
  enPluralsByPath: Map<string, PluralInfo>,
): boolean {
  const segments = frPath.split("/");
  const parts: string[] = [];
  for (const segment of segments) {
    parts.push(segment);
    const exactKey = exactKeyFromSegment(segment);
    if (!exactKey) continue;
    const parentPath = parts.slice(0, -1).join("/");
    const enPlural = enPluralsByPath.get(parentPath);
    if (!enPlural || !enPlural.exactKeys.includes(exactKey)) {
      return true;
    }
  }
  return false;
}

function pluralSignature(plural: PluralInfo): string {
  return plural.structuralPath;
}

function assertRuntimePluralRulesAgree(): void {
  for (const pluralType of ["cardinal", "ordinal"] as const) {
    const actual = [
      ...new Intl.PluralRules("fr-CA", { type: pluralType }).resolvedOptions()
        .pluralCategories,
    ].sort();
    const expected = [...FR_CA_PLURAL_CATEGORIES[pluralType]].sort();
    assert.deepEqual(
      actual,
      expected,
      `Intl.PluralRules("fr-CA", { type: "${pluralType}" }) categories [${actual.join(", ")}] do not match the hardcoded CLDR 38+ expectation [${expected.join(", ")}] — Node ICU data may be incomplete (small-icu / old runtime). Fix the runtime or update FR_CA_PLURAL_CATEGORIES deliberately.`,
    );
  }
}

function assertFrPluralCoverage(label: string, plurals: PluralInfo[]): void {
  for (const plural of plurals) {
    const required = FR_CA_PLURAL_CATEGORIES[plural.pluralType];
    const allowed = new Set<string>(required);
    for (const category of required) {
      assert.ok(
        plural.categories.includes(category),
        `${label}: plural "${plural.structuralPath}" missing required fr-CA category "${category}" (have: ${plural.categories.join(", ") || "(none)"}). Cardinal "many" is required (CLDR 38+) for large round numbers — do not rely on fallback to "other".`,
      );
    }
    for (const category of plural.categories) {
      assert.ok(
        allowed.has(category),
        `${label}: plural "${plural.structuralPath}" has unused fr-CA category "${category}" (allowed: ${required.join(", ")}). fr-CA never selects "${category}" — for an exact zero use =0, not zero (0 resolves to "one").`,
      );
    }
  }
}

function assertExactPluralKeysPreserved(
  label: string,
  enPlurals: PluralInfo[],
  frPlurals: PluralInfo[],
): void {
  assert.equal(
    new Set(frPlurals.map((plural) => plural.structuralPath)).size,
    frPlurals.length,
    `${label}: duplicate fr-CA plural structural paths (sibling index bug)`,
  );
  assert.equal(
    new Set(enPlurals.map((plural) => plural.structuralPath)).size,
    enPlurals.length,
    `${label}: duplicate en-CA plural structural paths (sibling index bug)`,
  );

  const frByPath = new Map(
    frPlurals.map((plural) => [plural.structuralPath, plural]),
  );

  for (const enPlural of enPlurals) {
    const frPlural = frByPath.get(enPlural.structuralPath);
    assert.ok(
      frPlural,
      `${label}: missing fr-CA plural at structural path "${enPlural.structuralPath}"`,
    );

    const frExact = new Set(frPlural.exactKeys);
    for (const exactKey of enPlural.exactKeys) {
      assert.ok(
        frExact.has(exactKey),
        `${label}: plural "${enPlural.structuralPath}" is missing en-CA exact branch "${exactKey}" in fr-CA (fr has: ${frPlural.exactKeys.join(", ") || "(none)"}). French may add extra =N keys, but must not drop English ones.`,
      );
    }
  }
}

/**
 * Each non-`other` category branch's named args must be ⊆ `other`'s in the
 * same locale. Catches typos / unknown args in `one`/`many`; allows singular
 * to omit args that plural keeps. `#` and plural variables are not args.
 */
function assertCategoryArgsMatchOther(
  label: string,
  plurals: PluralInfo[],
): void {
  for (const plural of plurals) {
    const otherSet = new Set(plural.otherArgs);
    for (const [category, args] of Object.entries(plural.categoryArgs)) {
      const unexpected = args.filter((arg) => !otherSet.has(arg));
      assert.equal(
        unexpected.length,
        0,
        `${label}: plural "${plural.structuralPath}" category "${category}" args ${JSON.stringify(args)} must be ⊆ other ${JSON.stringify(plural.otherArgs)} (unexpected: ${JSON.stringify(unexpected)}; same-locale; # and plural variable omitted)`,
      );
    }
  }
}

function formatDroppedArgs(args: string[]): string {
  return args.map((arg) => `{${arg}}`).join(", ");
}

/**
 * Cross-locale partner to same-locale ⊆: fr must not drop args that en uses in
 * the same category / exact branch. fr `one` ⊇ en `one`, fr `other` ⊇ en
 * `other`; fr-only `many` ⊇ en `other`; each shared `=N` fr exactArgs ⊇ en.
 */
function assertFrCategoryArgsPreserveEn(
  label: string,
  enPlurals: PluralInfo[],
  frPlurals: PluralInfo[],
): void {
  const frByPath = new Map(
    frPlurals.map((plural) => [plural.structuralPath, plural]),
  );

  for (const enPlural of enPlurals) {
    const frPlural = frByPath.get(enPlural.structuralPath);
    if (!frPlural) continue;

    const path = enPlural.structuralPath;

    const frOther = new Set(frPlural.otherArgs);
    const missingOther = enPlural.otherArgs.filter((arg) => !frOther.has(arg));
    assert.equal(
      missingOther.length,
      0,
      `${label}: fr-CA \`other\` drops ${formatDroppedArgs(missingOther)} that en-CA \`other\` uses (plural "${path}")`,
    );

    const enOne = enPlural.categoryArgs.one;
    if (enOne) {
      const frOne = new Set(frPlural.categoryArgs.one ?? []);
      const missingOne = enOne.filter((arg) => !frOne.has(arg));
      assert.equal(
        missingOne.length,
        0,
        `${label}: fr-CA \`one\` drops ${formatDroppedArgs(missingOne)} that en-CA \`one\` uses (plural "${path}")`,
      );
    }

    const frMany = frPlural.categoryArgs.many;
    if (frMany) {
      const manySet = new Set(frMany);
      const missingMany = enPlural.otherArgs.filter((arg) => !manySet.has(arg));
      assert.equal(
        missingMany.length,
        0,
        `${label}: fr-CA \`many\` drops ${formatDroppedArgs(missingMany)} that en-CA \`other\` uses (plural "${path}")`,
      );
    }

    for (const exactKey of enPlural.exactKeys) {
      const enExact = enPlural.exactArgs[exactKey] ?? [];
      const frExact = new Set(frPlural.exactArgs[exactKey] ?? []);
      const missingExact = enExact.filter((arg) => !frExact.has(arg));
      assert.equal(
        missingExact.length,
        0,
        `${label}: fr-CA \`${exactKey}\` drops ${formatDroppedArgs(missingExact)} that en-CA \`${exactKey}\` uses (plural "${path}")`,
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

  // One-way: every en path must exist in fr. Extra fr paths are allowed when
  // any `=N` in the chain is fr-only per en `exactKeys` at the parent path.
  // Extras under shared =N (including plain-text =0) / other / one fail.
  const enPluralsByPath = new Map(
    enShape.plurals.map((plural) => [plural.structuralPath, plural]),
  );
  const enPaths = new Set(enPluralsByPath.keys());
  const frPathList = frShape.plurals.map(pluralSignature);
  const frPaths = new Set(frPathList);
  for (const enPath of enPaths) {
    assert.ok(
      frPaths.has(enPath),
      `${label}: missing fr-CA plural path "${enPath}" (fr may add paths under fr-only =N nests, but must keep every en path)`,
    );
  }
  for (const frPath of frPathList) {
    if (enPaths.has(frPath)) continue;
    assert.ok(
      isAllowedExtraFrPath(frPath, enPluralsByPath),
      `${label}: unexpected extra fr-CA plural path "${frPath}" (only nests under fr-only =N segments are allowed; extras under shared =N/other/one fail)`,
    );
  }

  // Category branches are locale-specific (fr-CA needs `many`); =N from en must remain.
  // Coverage-only nests under locale-only categories still need fr categories.
  assertFrPluralCoverage(label, [
    ...frShape.plurals,
    ...frShape.coveragePlurals,
  ]);
  assertExactPluralKeysPreserved(label, enShape.plurals, frShape.plurals);
  assertCategoryArgsMatchOther(label, [
    ...enShape.plurals,
    ...enShape.coveragePlurals,
    ...frShape.plurals,
    ...frShape.coveragePlurals,
  ]);
  assertFrCategoryArgsPreserveEn(label, enShape.plurals, frShape.plurals);
}

function loadNamespace(locale: string, namespace: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(messagesRoot, locale, `${namespace}.json`), "utf8"),
  ) as Record<string, unknown>;
}

describe("ICU plural structural pairing", () => {
  const enNested = `{role, select, admin {{count, plural, =0 {none} one {# site} other {# sites}}} guest {{count, plural, one {# site} other {# sites}}} other {{count, plural, one {# site} other {# sites}}}}`;

  it("pairs =N keys across reordered select branches", () => {
    // French lists `other` before `admin` — walk order differs, paths must still match.
    const frNested = `{role, select, other {{count, plural, one {# site} many {# sites} other {# sites}}} guest {{count, plural, one {# site} many {# sites} other {# sites}}} admin {{count, plural, =0 {aucun} one {# site} many {# sites} other {# sites}}}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "reorderedSelect", enNested, frNested),
    );
  });

  it("still detects a dropped =0 when select branches are reordered", () => {
    const frDropped = `{role, select, other {{count, plural, one {# site} many {# sites} other {# sites}}} guest {{count, plural, =0 {aucun} one {# site} many {# sites} other {# sites}}} admin {{count, plural, one {# site} many {# sites} other {# sites}}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "droppedExact", enNested, frDropped),
      /select:role:admin\/plural:count:cardinal#0[\s\S]*=0/,
    );
  });

  it("allows a nested plural under fr-only many without path mismatch", () => {
    const en = `{count, plural, one {# site} other {# sites}}`;
    // Nested plural reuses `count` so args still match; path must not require en counterpart.
    const fr = `{count, plural, one {# site} many {{count, plural, one {beaucoup} many {énormément} other {énormément}}} other {# sites}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "manyOnlyNested", en, fr),
    );
  });

  it("keeps sibling plurals distinct so =N cannot collapse across them", () => {
    const en = `{count, plural, =0 {No sites} other {# sites}} ({count, plural, one {# site} other {# sites}} free)`;
    const frMissingFirst = `{count, plural, one {aucun} many {#} other {# sites}} ({count, plural, =0 {aucun} one {# site} many {#} other {# sites}} libres)`;
    const frOk = `{count, plural, =0 {Aucun site} one {#} many {#} other {# sites}} ({count, plural, one {# site} many {#} other {# sites}} libres)`;

    assert.throws(
      () => assertIcuParity("fixture", "siblingDropped", en, frMissingFirst),
      /plural:count:cardinal#0[\s\S]*=0/,
    );
    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "siblingOk", en, frOk),
    );
  });

  it("allows a nested plural under fr-only =1 without path mismatch", () => {
    const en = `{count, plural, =0 {none} one {# site} other {# sites}}`;
    const fr = `{count, plural, =0 {aucun} =1 {{count, plural, one {pile un} many {pile un} other {pile un}}} one {# site} many {# sites} other {# sites}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "exactOneOnlyNested", en, fr),
    );
  });

  it("exactKeyFromSegment matches isExactPluralKey for non-integer =N", () => {
    // formatjs rejects `=1.5` in source, but path segments can still carry it
    // if another producer records it — keep parse aligned with isExactPluralKey.
    assert.equal(exactKeyFromSegment("plural:count:=0"), "=0");
    assert.equal(exactKeyFromSegment("plural:count:=1.5"), "=1.5");
    assert.equal(exactKeyFromSegment("plural:count:=-1"), "=-1");
    assert.equal(exactKeyFromSegment("plural:count:one"), null);
    assert.equal(exactKeyFromSegment("plural:count:category"), null);

    const enPluralsByPath = new Map<string, PluralInfo>([
      [
        "plural:count:cardinal#0",
        {
          structuralPath: "plural:count:cardinal#0",
          name: "count",
          pluralType: "cardinal",
          categories: ["one", "other"],
          exactKeys: ["=0"],
          otherArgs: [],
          categoryArgs: {},
          exactArgs: {},
        },
      ],
    ]);
    assert.equal(
      isAllowedExtraFrPath(
        "plural:count:cardinal#0/plural:count:=1.5/plural:count:cardinal#0",
        enPluralsByPath,
      ),
      true,
    );
  });

  it("fails when a skipped category branch introduces an unknown argument", () => {
    const en = `{count, plural, one {# site for {name}} other {# sites for {name}}}`;
    const frTypoInOne = `{count, plural, one {# site pour {nom}} many {# sites pour {name}} other {# sites pour {name}}}`;
    const frExtraInMany = `{count, plural, one {# site pour {name}} many {# sites pour {name} ({extra})} other {# sites pour {name}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "typoInOne", en, frTypoInOne),
      /argument names must match/,
    );
    assert.throws(
      () => assertIcuParity("fixture", "extraInMany", en, frExtraInMany),
      /argument names must match/,
    );
  });

  it("fails when a nested plural under one drops =0", () => {
    const en = `{count, plural, one {{guests, plural, =0 {no guests} one {# guest} other {# guests}}} other {{guests, plural, =0 {no guests} one {# guest} other {# guests}}}}`;
    // Nested guests under fr `one` drops =0 (and has many); under `other` keeps =0.
    const fr = `{count, plural, one {{guests, plural, one {# invité} many {# invités} other {# invités}}} many {{guests, plural, =0 {aucun} one {# invité} many {# invités} other {# invités}}} other {{guests, plural, =0 {aucun} one {# invité} many {# invités} other {# invités}}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "nestedOneDroppedExact", en, fr),
      /plural:count:cardinal#0\/plural:count:one\/plural:guests:cardinal#0[\s\S]*=0/,
    );
  });

  it("allows category branches to omit args that other keeps", () => {
    // category ⊆ other: singular may drop `{name}` that plural keeps.
    const en = `{count, plural, one {# site} other {# sites for {name}}}`;
    const fr = `{count, plural, one {# site} many {# sites pour {name}} other {# sites pour {name}}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "oneOmitsName", en, fr),
    );
  });

  it("allows {count} in other like # when the plural variable is count", () => {
    const en = `{count, plural, one {One site} other {{count} sites}}`;
    const fr = `{count, plural, one {Un site} many {{count} sites} other {{count} sites}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "countAsArgLikePound", en, fr),
    );
  });

  it("allows nested plural {guests} like # under outer one", () => {
    const en = `{count, plural, one {{guests, plural, one {one guest} other {{guests} guests}}} other {{guests, plural, one {# guest} other {# guests}}}}`;
    const fr = `{count, plural, one {{guests, plural, one {un invité} many {{guests} invités} other {{guests} invités}}} many {{guests, plural, one {# invité} many {# invités} other {# invités}}} other {{guests, plural, one {# invité} many {# invités} other {# invités}}}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "nestedGuestsAsArgLikePound", en, fr),
    );
  });

  it("fails when fr one drops an argument that en one keeps", () => {
    const en = `{count, plural, one {# site for {name}} other {# sites for {name}}}`;
    const fr = `{count, plural, one {# site} many {# sites pour {name}} other {# sites pour {name}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "frOneDropsName", en, fr),
      /fr-CA `one` drops \{name\} that en-CA `one` uses/,
    );
  });

  it("fails when fr one introduces an argument other lacks", () => {
    // `{extra}` also appears outside so overall arg sets still match.
    const en = `{count, plural, one {# site for {name}} other {# sites for {name}}} ({extra})`;
    const fr = `{count, plural, one {# site pour {name} ({extra})} many {# sites pour {name}} other {# sites pour {name}}} ({extra})`;

    assert.throws(
      () => assertIcuParity("fixture", "oneExtraArg", en, fr),
      /category "one" args/,
    );
  });

  it("fails when fr adds an extra plural under other", () => {
    const en = `{count, plural, one {# site} other {# sites}}`;
    // Reuses `count` so the overall arg set still matches — only the path drifts.
    const fr = `{count, plural, one {# site} many {# sites} other {# sites ({count, plural, one {a} many {b} other {c}})}}`;

    assert.throws(
      () => assertIcuParity("fixture", "extraUnderOther", en, fr),
      /unexpected extra fr-CA plural path/,
    );
  });

  it("fails when fr adds an extra plural under a shared =0", () => {
    const en = `{count, plural, =0 {{guests, plural, =0 {none} other {# guests}}} one {# site} other {# sites}}`;
    // Extra sibling under shared =0 (reuses guests); must not be tolerated.
    const fr = `{count, plural, =0 {{guests, plural, =0 {aucun} one {#} many {#} other {# invités}} {guests, plural, one {x} many {y} other {z}}} one {# site} many {# sites} other {# sites}}`;

    assert.throws(
      () => assertIcuParity("fixture", "extraUnderSharedExact", en, fr),
      /unexpected extra fr-CA plural path/,
    );
  });

  it("allows a fr-only =1 nest under a shared =0", () => {
    const en = `{count, plural, =0 {{guests, plural, =0 {none} other {# guests}}} one {# site} other {# sites}}`;
    const fr = `{count, plural, =0 {{guests, plural, =0 {aucun} =1 {{guests, plural, one {pile un} many {x} other {x}}} one {#} many {#} other {# invités}}} one {# site} many {# sites} other {# sites}}`;

    assert.doesNotThrow(() =>
      assertIcuParity("fixture", "exactOneUnderSharedZero", en, fr),
    );
  });

  it("fails coverage under many with a path that includes :many", () => {
    const en = `{count, plural, one {# site} other {# sites}}`;
    // Nested plural under many is missing required fr `many` category.
    const fr = `{count, plural, one {# site} many {{count, plural, one {beaucoup} other {énormément}}} other {# sites}}`;

    assert.throws(
      () => assertIcuParity("fixture", "manyCoveragePath", en, fr),
      /plural:count:cardinal#0\/plural:count:many\/plural:count:cardinal#0[\s\S]*missing required fr-CA category "many"/,
    );
  });

  it("fails when fr uses an unused category like zero", () => {
    const en = `{count, plural, one {# site} other {# sites}}`;
    const fr = `{count, plural, zero {aucun} one {#} many {#} other {#}}`;

    assert.throws(
      () => assertIcuParity("fixture", "unusedZero", en, fr),
      /unused fr-CA category "zero"[\s\S]*=0/,
    );
  });

  it("fails when fr =0 drops an argument that en =0 keeps", () => {
    const en = `{count, plural, =0 {No sites at {name}} one {# site at {name}} other {# sites at {name}}}`;
    const fr = `{count, plural, =0 {Aucun site} one {# site à {name}} many {# sites à {name}} other {# sites à {name}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "exactZeroDropsName", en, fr),
      /fr-CA `=0` drops \{name\} that en-CA `=0` uses/,
    );
  });

  it("fails when fr nests an extra plural under a shared plain =0", () => {
    const en = `{count, plural, =0 {No sites} one {# site} other {# sites}}`;
    // Reuses `count` so overall args still match — only the path under shared =0 drifts.
    const fr = `{count, plural, =0 {{count, plural, one {a} many {b} other {c}}} one {# site} many {# sites} other {# sites}}`;

    assert.throws(
      () => assertIcuParity("fixture", "extraUnderPlainSharedExact", en, fr),
      /unexpected extra fr-CA plural path/,
    );
  });

  it("fails when fr one drops a select that en one keeps", () => {
    const en = `{count, plural, one {One {kind, select, tent {tent site} other {site}}} other {# {kind, select, tent {tent sites} other {sites}}}}`;
    const fr = `{count, plural, one {Un emplacement} many {# {kind, select, tent {emplacements tente} other {emplacements}}} other {# {kind, select, tent {emplacements tente} other {emplacements}}}}`;

    assert.throws(
      () => assertIcuParity("fixture", "oneDropsSelect", en, fr),
      /fr-CA `one` drops \{kind\} that en-CA `one` uses/,
    );
  });
});

describe("fr-CA message parity (existing namespaces only)", () => {
  const frFiles = readdirSync(join(messagesRoot, "fr-CA"))
    .filter((name) => name.endsWith(".json"))
    .sort();

  it("documents which fr-CA namespaces exist (missing ones are issue #2, not failures)", () => {
    assert.deepEqual(frFiles, [...EXISTING_FR_CA_FILES]);
  });

  it("hardcoded fr-CA PluralRules categories agree with this Node runtime", () => {
    assertRuntimePluralRulesAgree();
  });

  it("identical-value allowlist entries exist in en-CA leaves", () => {
    for (const key of IDENTICAL_VALUE_ALLOWLIST) {
      const dot = key.indexOf(".");
      assert.ok(dot > 0, `allowlist key must be namespace.path, got ${key}`);
      const namespace = key.slice(0, dot);
      const path = key.slice(dot + 1);
      const leaves = collectLeaves(loadNamespace("en-CA", namespace));
      assert.ok(
        leaves.has(path),
        `allowlist entry "${key}" is stale — not present in messages/en-CA/${namespace}.json`,
      );
    }
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
