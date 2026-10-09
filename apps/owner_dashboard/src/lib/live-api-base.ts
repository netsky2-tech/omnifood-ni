/**
 * Environment resolution for the LIVE test suites of the owner dashboard
 * (`src/__tests__/*.integration.test.ts`, `src/__tests__/w4-e2e-fiscal.test.ts`,
 * `e2e/*.live.spec.ts`, `playwright.live.config.ts`).
 *
 * Contract:
 * - **Blank means unset.** A live suite variable that is *present but empty*
 *   (`export NHILOS_LIVE_API=`, an empty value in a CI env block, or a stray
 *   `.env` line) is a string, not nullish, so `process.env.X ?? fallback` keeps
 *   `""`. The suite then requests a relative path and fails with errors that
 *   look like backend bugs. Here every blank/whitespace-only value falls back
 *   to the canonical default.
 * - **Values are trimmed** so a trailing space copied from a command line can
 *   never become part of a URL.
 * - **The canonical local target is the shadow stack on port 3300** (plus the
 *   dev server on 5174). Ports 3000 and 5173 belong to other worktrees' stacks,
 *   so live suites must never default there (issue #828 /
 *   R3-W1-DEFAULT-PORT-MISMATCH).
 * - `NHILOS_LIVE_API` must be the **full API base, including the `/api`
 *   prefix** (for example `http://127.0.0.1:3300/api`); suites concatenate
 *   `/identity/login` and friends directly onto it.
 *
 * This module reads `process.env` only and has no Vite/`import.meta.env`
 * dependency, which is what lets the same rules run in Vitest (node
 * environment), in Playwright specs, and in the Playwright config file.
 */

/** Canonical API base for local live suites: this worktree's shadow stack. */
export const LIVE_API_BASE_DEFAULT = "http://127.0.0.1:3300/api";

/** Canonical web origin for local live Playwright runs (tenant hostname + :5174). */
export const LIVE_WEB_BASE_DEFAULT = "http://soho-test-fixture.localhost:5174";

/**
 * Normalizes one raw environment value: returns the trimmed string when the
 * value is a non-blank string, `undefined` for anything else (missing, null,
 * empty, whitespace-only, or a non-string).
 */
export function envValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Reads a live-suite variable, falling back when it is unset or blank. */
export function resolveLiveEnv(name: string, fallback: string): string {
  return envValue(process.env[name]) ?? fallback;
}

/** API base used by the live HTTP suites (`NHILOS_LIVE_API`). */
export function resolveLiveApiBase(): string {
  return resolveLiveEnv("NHILOS_LIVE_API", LIVE_API_BASE_DEFAULT);
}

/** Browser origin used by the live Playwright specs (`NHILOS_LIVE_BASE`). */
export function resolveLiveWebBase(): string {
  return resolveLiveEnv("NHILOS_LIVE_BASE", LIVE_WEB_BASE_DEFAULT);
}
