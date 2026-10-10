import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_API_BASE_DEFAULT,
  LIVE_WEB_BASE_DEFAULT,
  LiveApiConfigError,
  envValue,
  resolveLiveApiBase,
  resolveLiveApiOrigin,
  resolveLiveEnv,
  resolveLiveWebBase,
} from "@/lib/live-api-base";

const LIVE_API_ENV = "NHILOS_LIVE_API" as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("envValue", () => {
  it("trims a populated value", () => {
    expect(envValue("  http://127.0.0.1:3300/api  ")).toBe("http://127.0.0.1:3300/api");
  });

  it("treats an empty string as unset (the `??` defect this helper replaces)", () => {
    expect(envValue("")).toBeUndefined();
  });

  it("treats whitespace-only as unset", () => {
    expect(envValue("   \t ")).toBeUndefined();
  });

  it.each([["undefined", undefined], ["null", null], ["a number", 3300]])(
    "returns undefined for %s",
    (_label, value) => {
      expect(envValue(value)).toBeUndefined();
    },
  );
});

describe("resolveLiveApiBase", () => {
  it("uses the canonical default when the env var is absent", () => {
    vi.stubEnv(LIVE_API_ENV, undefined);
    expect(resolveLiveApiBase()).toBe(LIVE_API_BASE_DEFAULT);
  });

  it("falls back to the canonical default when the env var is present but empty", () => {
    // `NHILOS_LIVE_API=` (exported empty, CI env block, or a blank .env line) is a
    // string, so `process.env.NHILOS_LIVE_API ?? default` yields "" and every
    // request goes to a relative path. The default must survive it.
    vi.stubEnv(LIVE_API_ENV, "");
    expect(resolveLiveApiBase()).toBe(LIVE_API_BASE_DEFAULT);
  });

  it("falls back to the canonical default when the env var is whitespace only", () => {
    vi.stubEnv(LIVE_API_ENV, "   ");
    expect(resolveLiveApiBase()).toBe(LIVE_API_BASE_DEFAULT);
  });

  it("keeps an explicit override and trims it", () => {
    vi.stubEnv(LIVE_API_ENV, " http://127.0.0.1:3301/api ");
    expect(resolveLiveApiBase()).toBe("http://127.0.0.1:3301/api");
  });
});

describe("resolveLiveWebBase", () => {
  it("falls back to the tenant-host dev server when the env var is empty", () => {
    vi.stubEnv("NHILOS_LIVE_BASE", "");
    expect(resolveLiveWebBase()).toBe(LIVE_WEB_BASE_DEFAULT);
  });

  it("keeps an explicit override and trims it", () => {
    vi.stubEnv("NHILOS_LIVE_BASE", "http://soho-test-fixture.localhost:5175");
    expect(resolveLiveWebBase()).toBe("http://soho-test-fixture.localhost:5175");
  });
});

describe("resolveLiveEnv", () => {
  it("returns the fallback for an unset variable", () => {
    vi.stubEnv("NHILOS_LIVE_EMAIL", undefined);
    expect(resolveLiveEnv("NHILOS_LIVE_EMAIL", "sofia@omnifood.ni")).toBe("sofia@omnifood.ni");
  });

  it("returns the fallback for an empty variable", () => {
    vi.stubEnv("NHILOS_LIVE_PASSWORD", "");
    expect(resolveLiveEnv("NHILOS_LIVE_PASSWORD", "password123")).toBe("password123");
  });

  it("returns the trimmed value for a populated variable", () => {
    vi.stubEnv("MANUAL_E2E_EMAIL", "  owner@soho.com ");
    expect(resolveLiveEnv("MANUAL_E2E_EMAIL", "admin@soho.com")).toBe("owner@soho.com");
  });
});

describe("canonical live-stack contract (issue #828 / R3-W1-DEFAULT-PORT-MISMATCH)", () => {
  it("pins the API default to the shadow stack on :3300", () => {
    expect(LIVE_API_BASE_DEFAULT).toBe("http://127.0.0.1:3300/api");
  });

  it("never points the live-suite default at :3000 (owned by another worktree stack)", () => {
    expect(LIVE_API_BASE_DEFAULT).not.toMatch(/:3000\b/);
    expect(LIVE_WEB_BASE_DEFAULT).not.toMatch(/:3000\b/);
    expect(LIVE_WEB_BASE_DEFAULT).not.toMatch(/:5173\b/);
  });

  it("documents that the API default is a full base including the /api prefix", () => {
    expect(LIVE_API_BASE_DEFAULT.endsWith("/api")).toBe(true);
  });
});

describe("API prefix normalization (review advisory R3-NO-API-PREFIX-VALIDATION)", () => {
  it("appends /api when the operator passes an origin only", () => {
    // The same shape VITE_API_URL uses (origin only) is the most natural thing to
    // type; without normalization the suite would request /identity/login on the
    // origin and fail with a 404 that looks like a routing bug.
    vi.stubEnv(LIVE_API_ENV, "http://127.0.0.1:3300");
    expect(resolveLiveApiBase()).toBe("http://127.0.0.1:3300/api");
  });

  it("never doubles the prefix", () => {
    vi.stubEnv(LIVE_API_ENV, "http://127.0.0.1:3300/api/");
    expect(resolveLiveApiBase()).toBe("http://127.0.0.1:3300/api");
  });

  it("keeps a non-empty custom path untouched (proxied prefix), trailing slash removed", () => {
    vi.stubEnv(LIVE_API_ENV, "https://api-staging.nhilospos.com/gateway/");
    expect(resolveLiveApiBase()).toBe("https://api-staging.nhilospos.com/gateway");
  });
});

describe("absolute-URL guard (review advisory R3-URL-CONSTRUCT-THROWS)", () => {
  it.each([
    ["a relative base", "/api"],
    ["a host without a scheme", "localhost:3300/api"],
    ["an unsupported protocol", "ftp://127.0.0.1:3300/api"],
    ["embedded credentials", "https://user:pass@127.0.0.1:3300/api"],
    ["a query string", "http://127.0.0.1:3300/api?token=super-secret"],
    ["a fragment", "http://127.0.0.1:3300/api#token"],
  ])("rejects %s with a LiveApiConfigError", (_label, value) => {
    vi.stubEnv(LIVE_API_ENV, value);
    expect(() => resolveLiveApiBase()).toThrow(LiveApiConfigError);
    expect(() => resolveLiveApiOrigin()).toThrow(LiveApiConfigError);
  });

  it("names the offending variable instead of leaking its value", () => {
    vi.stubEnv(LIVE_API_ENV, "http://127.0.0.1:3300/api?token=super-secret");
    try {
      resolveLiveApiOrigin();
      expect.unreachable("expected LiveApiConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(LiveApiConfigError);
      const message = (error as Error).message;
      expect(message).toContain("NHILOS_LIVE_API");
      expect(message).not.toContain("super-secret");
    }
  });

  it("never throws a bare TypeError for a relative override", () => {
    vi.stubEnv(LIVE_API_ENV, "127.0.0.1:3300/api");
    let caught: unknown;
    try {
      resolveLiveApiOrigin();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LiveApiConfigError);
    expect(caught).not.toBeInstanceOf(TypeError);
  });
});

describe("resolveLiveApiOrigin", () => {
  it("returns the origin of the canonical default (dev-server env must not duplicate the port)", () => {
    vi.stubEnv(LIVE_API_ENV, undefined);
    expect(resolveLiveApiOrigin()).toBe("http://127.0.0.1:3300");
  });

  it("returns the origin of an overridden base", () => {
    vi.stubEnv(LIVE_API_ENV, "http://127.0.0.1:3301/api");
    expect(resolveLiveApiOrigin()).toBe("http://127.0.0.1:3301");
  });
});
