/**
 * Centralized API base URL resolution for the owner dashboard.
 *
 * Contract:
 * - `VITE_API_URL` is the API ORIGIN (for example
 *   `https://api-staging.nhilospos.com`). The `/api` prefix is appended here,
 *   exactly once, for every dashboard API call (login, refresh, retry, and all
 *   feature calls routed through `lib/api.ts`).
 * - When `VITE_API_URL` is absent or blank, the base defaults to the relative
 *   path `/api`, which keeps local development working through the Vite dev
 *   proxy (`/api` -> `http://localhost:3000`). Deployed environments must set
 *   `VITE_API_URL`; local development must not depend on deployed headers.
 * - Invalid configuration throws `ApiBaseUrlConfigError` with a message that
 *   never echoes the configured value, because the value may contain secrets.
 */

const API_PREFIX = "/api";
const DEV_DEFAULT_BASE_URL = "/api";

export class ApiBaseUrlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiBaseUrlConfigError";
  }
}

function invalidConfiguration(reason: string): ApiBaseUrlConfigError {
  return new ApiBaseUrlConfigError(
    `Invalid VITE_API_URL: ${reason}. ` +
      "Set VITE_API_URL to the API origin only (for example, https://api.example.com); " +
      "the /api prefix is appended automatically.",
  );
}

/**
 * Validates a configured API origin and returns its normalized form
 * (lowercase host, no trailing slash, no path). Values that would make the
 * dashboard call the wrong origin are rejected: relative URLs, non-http(s)
 * protocols, embedded credentials, query strings, fragments, and any path
 * (such as `/api`), so the `/api` prefix can never be doubled.
 */
export function resolveConfiguredApiOrigin(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw invalidConfiguration("a non-empty URL string is required");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalidConfiguration("an absolute http(s) URL is required");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidConfiguration("the protocol must be http or https");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw invalidConfiguration("embedded credentials are not allowed");
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw invalidConfiguration("query strings and fragments are not allowed");
  }
  if (url.pathname !== "/") {
    throw invalidConfiguration("the origin must not include a path");
  }

  return url.origin;
}

/** Resolves the base URL that every dashboard API call must use. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured !== "string" || configured.trim().length === 0) {
    return DEV_DEFAULT_BASE_URL;
  }
  return `${resolveConfiguredApiOrigin(configured)}${API_PREFIX}`;
}
