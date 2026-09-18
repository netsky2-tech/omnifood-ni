import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiBaseUrlConfigError,
  getApiBaseUrl,
  resolveConfiguredApiOrigin,
} from "@/lib/api-base-url";

const STAGING_ORIGIN = "https://api-staging.nhilospos.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveConfiguredApiOrigin", () => {
  it("returns the normalized origin for a valid https origin", () => {
    expect(resolveConfiguredApiOrigin(STAGING_ORIGIN)).toBe(STAGING_ORIGIN);
  });

  it("normalizes the trailing slash away", () => {
    expect(resolveConfiguredApiOrigin(`${STAGING_ORIGIN}/`)).toBe(STAGING_ORIGIN);
  });

  it("lowercases the host", () => {
    expect(resolveConfiguredApiOrigin("https://API-Staging.NhilosPos.com")).toBe(STAGING_ORIGIN);
  });

  it("accepts an explicit http origin", () => {
    expect(resolveConfiguredApiOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it.each([
    ["a relative path", "api-staging.nhilospos.com"],
    ["an unsupported protocol", "ftp://api-staging.nhilospos.com"],
    ["embedded credentials", `https://user:pass@${STAGING_ORIGIN.replace("https://", "")}`],
    ["a query string", `${STAGING_ORIGIN}/?env=staging`],
    ["a fragment", `${STAGING_ORIGIN}/#token`],
    ["an /api path (would double the prefix)", `${STAGING_ORIGIN}/api`],
    ["an /api path with trailing slash", `${STAGING_ORIGIN}/api/`],
    ["a nested path", `${STAGING_ORIGIN}/dashboard/`],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("rejects %s", (_label, value) => {
    expect(() => resolveConfiguredApiOrigin(value)).toThrow(ApiBaseUrlConfigError);
  });

  it("rejects non-string values", () => {
    expect(() => resolveConfiguredApiOrigin(undefined)).toThrow(ApiBaseUrlConfigError);
  });

  it("does not echo the configured value in error messages", () => {
    const secretBearing = "https://user:super-secret-token@api-staging.nhilospos.com/api?x=1";
    try {
      resolveConfiguredApiOrigin(secretBearing);
      expect.unreachable("expected ApiBaseUrlConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiBaseUrlConfigError);
      expect((error as Error).message).not.toContain("super-secret-token");
      expect((error as Error).message).not.toContain("user:");
      expect((error as Error).message).not.toContain(secretBearing);
    }
  });
});

describe("getApiBaseUrl", () => {
  it("defaults to the relative /api base when VITE_API_URL is absent (dev proxy contract)", () => {
    vi.stubEnv("VITE_API_URL", "");
    expect(getApiBaseUrl()).toBe("/api");
  });

  it("appends /api exactly once to the configured origin", () => {
    vi.stubEnv("VITE_API_URL", STAGING_ORIGIN);
    expect(getApiBaseUrl()).toBe(`${STAGING_ORIGIN}/api`);
  });

  it("appends /api exactly once even when the configured origin ends with a slash", () => {
    vi.stubEnv("VITE_API_URL", `${STAGING_ORIGIN}/`);
    expect(getApiBaseUrl()).toBe(`${STAGING_ORIGIN}/api`);
  });

  it("fails fast when VITE_API_URL includes a path (operator /api/api guard)", () => {
    vi.stubEnv("VITE_API_URL", `${STAGING_ORIGIN}/api`);
    expect(() => getApiBaseUrl()).toThrow(ApiBaseUrlConfigError);
  });
});
