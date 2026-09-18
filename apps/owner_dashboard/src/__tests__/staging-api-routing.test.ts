import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearTokens, refreshAccessToken, setTokens } from "@/lib/api";
import { login } from "@/lib/auth";

const STAGING_ORIGIN = "https://api-staging.nhilospos.com";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  clearTokens();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearTokens();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("staging API routing", () => {
  it("login targets the configured origin plus /api exactly once", async () => {
    vi.stubEnv("VITE_API_URL", STAGING_ORIGIN);
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, {
        accessToken: "staging-access",
        refreshToken: "staging-refresh",
        user: {
          id: "u1",
          email: "owner@example.com",
          name: "Owner",
          role: "OWNER",
          tenant_id: "t1",
        },
      }),
    );

    await login({ email: "owner@example.com", password: "secret" });

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      `${STAGING_ORIGIN}/api/identity/login`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "owner@example.com", password: "secret" }),
      }),
    );
  });

  it("generic feature API calls target the configured origin plus /api", async () => {
    vi.stubEnv("VITE_API_URL", STAGING_ORIGIN);
    setTokens({ accessToken: "staging-access", refreshToken: "staging-refresh" });
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await api.get("/sales/reports/summary");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${STAGING_ORIGIN}/api/sales/reports/summary`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer staging-access");
  });

  it("token refresh targets the configured origin plus /api", async () => {
    vi.stubEnv("VITE_API_URL", STAGING_ORIGIN);
    setTokens({ accessToken: "expired-access", refreshToken: "valid-refresh" });
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "new-access", refresh_token: "new-refresh" }),
    );

    await refreshAccessToken();

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      `${STAGING_ORIGIN}/api/identity/refresh`,
      expect.anything(),
    );
  });

  it("401 retry after refresh targets the same configured base", async () => {
    vi.stubEnv("VITE_API_URL", STAGING_ORIGIN);
    setTokens({ accessToken: "expired-access", refreshToken: "valid-refresh" });
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: "new-access", refresh_token: "new-refresh" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { summary: [] }));

    await api.get("/sales/reports/summary");

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const urls = fetchSpy.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      `${STAGING_ORIGIN}/api/sales/reports/summary`,
      `${STAGING_ORIGIN}/api/identity/refresh`,
      `${STAGING_ORIGIN}/api/sales/reports/summary`,
    ]);
  });

  it("falls back to the relative /api base when VITE_API_URL is absent (local dev)", async () => {
    vi.stubEnv("VITE_API_URL", "");
    setTokens({ accessToken: "dev-access", refreshToken: "dev-refresh" });
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await api.get("/sales/reports/summary");

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/sales/reports/summary",
      expect.anything(),
    );
  });
});
