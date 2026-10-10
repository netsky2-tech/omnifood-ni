/**
 * Environment resolution for the LIVE test suites of the owner dashboard
 * (`src/__tests__/*.live.test.ts`, `e2e/*.live.spec.ts`,
 * `playwright.live.config.ts`).
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
 * - `NHILOS_LIVE_API` accepts either the **full API base**
 *   (`http://127.0.0.1:3300/api`) or the **origin alone** (`http://127.0.0.1:3300`),
 *   the same shape `VITE_API_URL` uses. `/api` is appended exactly once, and any
 *   other non-empty path is preserved for proxied prefixes. Anything that cannot
 *   be a base URL (relative path, missing scheme, credentials, query string,
 *   fragment) throws `LiveApiConfigError`, which names the variable and never
 *   echoes its value.
 *
 * This module reads `process.env` only and has no Vite/`import.meta.env`
 * dependency, which is what lets the same rules run in Vitest (node
 * environment), in Playwright specs, and in the Playwright config file.
 */

const API_PREFIX = "/api";

/** Canonical API base for local live suites: this worktree's shadow stack. */
export const LIVE_API_BASE_DEFAULT = "http://127.0.0.1:3300/api";

/** Canonical web origin for local live Playwright runs (tenant hostname + :5174). */
export const LIVE_WEB_BASE_DEFAULT = "http://soho-test-fixture.localhost:5174";

/** Raised when a live-suite variable is configured with a value that cannot work. */
export class LiveApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveApiConfigError";
  }
}

function invalidApiBase(reason: string): LiveApiConfigError {
  // The configured value is deliberately not echoed: it may carry a token.
  return new LiveApiConfigError(
    `Invalid NHILOS_LIVE_API: ${reason}. Pass the API base ` +
      "(http://127.0.0.1:3300/api) or the origin alone (http://127.0.0.1:3300) — " +
      `the ${API_PREFIX} prefix is appended automatically.`,
  );
}

/** Normalizes one raw environment value: trimmed string or `undefined` when unset/blank. */
export function envValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Reads a live-suite variable, falling back when it is unset or blank. */
export function resolveLiveEnv(name: string, fallback: string): string {
  return envValue(process.env[name]) ?? fallback;
}

function parseApiBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidApiBase("an absolute http(s) URL is required");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidApiBase("the protocol must be http or https");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw invalidApiBase("embedded credentials are not allowed");
  }
  if (url.search.length > 0) {
    throw invalidApiBase("query strings are not allowed");
  }
  if (url.hash.length > 0) {
    throw invalidApiBase("fragments are not allowed");
  }
  return url;
}

/**
 * API base used by the live HTTP suites (`NHILOS_LIVE_API`, default
 * `http://127.0.0.1:3300/api`). Blank/unset falls back to the canonical default;
 * an unusable value fails fast with the variable named in the error.
 */
export function resolveLiveApiBase(): string {
  const url = parseApiBaseUrl(envValue(process.env.NHILOS_LIVE_API) ?? LIVE_API_BASE_DEFAULT);
  const path = url.pathname;
  if (path === "/" || path === API_PREFIX + "/") {
    url.pathname = API_PREFIX;
  } else if (path.endsWith("/")) {
    url.pathname = path.slice(0, -1);
  }
  return `${url.origin}${url.pathname}`;
}

/**
 * Origin of the same backend, for surfaces that must not carry the `/api` prefix
 * (the Playwright live config feeds this to the dev server as `VITE_API_URL`, so
 * browser and HTTP suites can never point at different ports).
 */
export function resolveLiveApiOrigin(): string {
  return parseApiBaseUrl(resolveLiveApiBase()).origin;
}

/** Browser origin used by the live Playwright specs (`NHILOS_LIVE_BASE`). */
export function resolveLiveWebBase(): string {
  return resolveLiveEnv("NHILOS_LIVE_BASE", LIVE_WEB_BASE_DEFAULT);
}
