/**
 * Suite-layout guard (issue #830, "Guard design" in odd/tasks/dashboard-suite-inventory.md).
 *
 * Rule: `.live.test.ts` is the only runner-significant suffix in `src/__tests__`.
 *   `.live.` ⇒ needs the real backend on 127.0.0.1:3300 ⇒ registered in
 *   `vitest.integration.config.ts` include ⇒ excluded in `vitest.config.ts`.
 *   Everything else under `src/**` runs in the default `npm test` unit run.
 *
 * This file reads the two vitest configs as text and lists `src/__tests__` —
 * no network, no server. The live-file list is derived from the `*.live.test.ts`
 * filenames, never hardcoded, so the guard stays true when a live suite is added.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TESTS_DIR = resolve(import.meta.dirname);
const APP_ROOT = resolve(TESTS_DIR, "../..");

/** Strip JS line and block comments so quoted paths inside comments are ignored. */
function stripJsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/** Extract quoted entries that point into src/__tests__ from comment-free config text. */
function quotedTestEntries(configText: string): string[] {
  const clean = stripJsComments(configText);
  const matches = clean.matchAll(/["']([^"']*src\/__tests__\/[^"']*)["']/g);
  // `m[1]` is `string | undefined` under noUncheckedIndexedAccess: keep only the
  // captured groups that actually matched, so the return type stays string[].
  return [...matches].flatMap((m) => (typeof m[1] === "string" ? [m[1]] : []));
}

/** Actual live suites on disk, derived from filenames (not hardcoded). */
function liveFilesOnDisk(): string[] {
  return readdirSync(TESTS_DIR)
    .filter((name) => isLiveNamed(name))
    .sort()
    .map((name) => `src/__tests__/${name}`);
}

/**
 * Live marker: the exact `.live.test.ts` suffix, with no exception. One shape
 * is what makes the rule checkable — `modifiers.live.test.ts` was renamed to
 * end this way precisely so the matcher never needs a looser pattern.
 */
function isLiveNamed(fileName: string): boolean {
  return fileName.endsWith(".live.test.ts");
}

const unitExclude = quotedTestEntries(
  readFileSync(join(APP_ROOT, "vitest.config.ts"), "utf8"),
);
const integrationInclude = quotedTestEntries(
  readFileSync(join(APP_ROOT, "vitest.integration.config.ts"), "utf8"),
);
const allTestFiles = readdirSync(TESTS_DIR)
  .filter((name) => /\.test\.tsx?$/.test(name))
  .sort();

describe("suite layout: .live.test.ts is the only runner-significant suffix", () => {
  it("registers every *.live.test.ts on disk in the integration include AND the unit exclude", () => {
    const live = liveFilesOnDisk();
    expect(live.length).toBeGreaterThan(0);
    for (const file of live) {
      expect(integrationInclude, `${file} missing from vitest.integration.config.ts include`).toContain(file);
      expect(unitExclude, `${file} missing from vitest.config.ts exclude`).toContain(file);
    }
  });

  it("lists only existing *.live.test.ts files in the integration include", () => {
    expect(integrationInclude.length).toBeGreaterThan(0);
    for (const entry of integrationInclude) {
      expect(isLiveNamed(entry), `${entry} is not a live-named suite`).toBe(true);
      expect(existsSync(join(APP_ROOT, entry)), `${entry} does not exist on disk`).toBe(true);
    }
  });

  it("has no file under src/__tests__ using the retired .integration suffix", () => {
    const retired = allTestFiles.filter((name) => name.includes(".integration."));
    expect(retired).toEqual([]);
  });

  it("names every network suite (resolveLiveApiBase + fetch) with the live marker", () => {
    // This guard itself is excluded: it merely contains those tokens as string
    // literals while doing readFileSync-only, no-network work.
    const networkSuites = allTestFiles
      .filter((name) => name !== "suite-layout.test.ts")
      .filter((name) => {
        const text = readFileSync(join(TESTS_DIR, name), "utf8");
        return text.includes("resolveLiveApiBase(") && text.includes("fetch(");
      });
    for (const name of networkSuites) {
      expect(
        isLiveNamed(name),
        `${name} calls resolveLiveApiBase( and fetch( but has no live marker in its name`,
      ).toBe(true);
    }
  });

  it("excludes from the default run only existing live suites (nothing server-free is hidden)", () => {
    const srcTestExcludes = unitExclude.filter((entry) =>
      entry.startsWith("src/__tests__/"),
    );
    expect(srcTestExcludes.length).toBeGreaterThan(0);
    for (const entry of srcTestExcludes) {
      expect(
        isLiveNamed(entry),
        `${entry} is excluded from npm test but has no live marker in its name`,
      ).toBe(true);
      expect(existsSync(join(APP_ROOT, entry)), `${entry} does not exist on disk`).toBe(true);
    }
  });

  it("keeps the live browser specs out of the static Playwright collection", () => {
    // The vitest rules above protect the node side only. e2e/*.live.spec.ts need
    // the real backend (:3300) and the live dev server (:5174), which
    // playwright.live.config.ts provides; the static config targets :5173 and
    // must not collect them at all. Before this rule the only thing stopping
    // `npm run test:e2e` from loading them was an env-gated test.skip — tribal
    // knowledge, not a boundary.
    const staticConfig = stripJsComments(
      readFileSync(join(APP_ROOT, "playwright.config.ts"), "utf8"),
    );
    expect(staticConfig).toMatch(/testIgnore:[^\n]*\.live\.spec\.ts/);
  });
});
