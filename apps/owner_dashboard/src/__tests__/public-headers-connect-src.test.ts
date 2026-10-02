/**
 * CSP `connect-src` contract for the shipped Cloudflare Pages `_headers`
 * file.
 *
 * The official API origin is `https://api.nhilospos.com`, but the legacy
 * host `https://api-staging.nhilospos.com` is a RETAINED ALIAS: provisioned
 * POS terminals persist their backend URL in `local_configs.api_base_url`
 * and `ApiBaseUrlService.resolve()` gives a persisted value precedence over
 * the compiled `API_URL` define. Dropping the old host from the CSP would
 * strand already-provisioned terminals, so the transition window must keep
 * BOTH hosts in `connect-src`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HEADERS_PATH = resolve(import.meta.dirname, "../../public/_headers");

const OFFICIAL_API_HOST = "https://api.nhilospos.com";
const RETAINED_ALIAS_HOST = "https://api-staging.nhilospos.com";

function readHeadersFile(): string {
  return readFileSync(HEADERS_PATH, "utf8");
}

function connectSrcDirective(headers: string): string {
  const cspLine = headers
    .split("\n")
    .find((line) => line.includes("Content-Security-Policy:"));
  expect(cspLine, "_headers must declare a Content-Security-Policy").toBeDefined();
  const directive = cspLine!
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src "));
  expect(directive, "CSP must declare a connect-src directive").toBeDefined();
  return directive!;
}

describe("public/_headers CSP connect-src", () => {
  it("allows the official API host https://api.nhilospos.com", () => {
    const sources = connectSrcDirective(readHeadersFile()).split(/\s+/);
    expect(sources).toContain(OFFICIAL_API_HOST);
  });

  it("keeps the retained alias https://api-staging.nhilospos.com", () => {
    const sources = connectSrcDirective(readHeadersFile()).split(/\s+/);
    expect(sources).toContain(RETAINED_ALIAS_HOST);
  });
});
