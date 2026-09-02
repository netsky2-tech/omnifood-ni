import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "@/lib/api";

describe("W1 — API integration (fetch-level)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiModule.clearTokens();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("api.get sends GET with Authorization header", async () => {
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Test" }),
    } as Response);

    const result = await apiModule.api.get<{ name: string }>("/users/me");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-at",
        }),
      }),
    );
    expect(result).toEqual({ name: "Test" });
  });

  it("api.post sends POST with body and headers", async () => {
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1" }),
    } as Response);

    await apiModule.api.post("/items", { name: "Test" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-at",
        }),
      }),
    );
  });

  it("refreshAccessToken posts to /identity/refresh and updates tokens", async () => {
    apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: "new-at", refreshToken: "new-rt" }),
    } as Response);

    const newToken = await apiModule.refreshAccessToken();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/identity/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "old-rt" }),
      }),
    );
    expect(newToken).toBe("new-at");
    expect(apiModule.getAccessToken()).toBe("new-at");
  });

  it("refreshAccessToken throws and clears tokens on non-ok response", async () => {
    apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(apiModule.refreshAccessToken()).rejects.toThrow("Refresh failed");
    expect(apiModule.getAccessToken()).toBeNull();
    expect(apiModule.hasStoredRefreshToken()).toBe(false);
  });

  it("apiFetch auto-refreshes on 401 and retries", async () => {
    apiModule.setTokens({ accessToken: "expired-at", refreshToken: "valid-rt" });

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "refreshed-at", refreshToken: "refreshed-rt" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "retried" }),
      } as Response);

    const result = await apiModule.api.get<{ data: string }>("/protected");

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: "retried" });
  });

  it("apiFetch throws Session expired when refresh fails on 401", async () => {
    apiModule.setTokens({ accessToken: "expired-at", refreshToken: "bad-rt" });

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    await expect(apiModule.api.get("/protected")).rejects.toThrow("Session expired");
    expect(apiModule.getAccessToken()).toBeNull();
  });

  it("apiFetch throws API error message from response body", async () => {
    apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Validation failed" }),
    } as Response);

    await expect(apiModule.api.get("/bad-request")).rejects.toThrow("Validation failed");
  });

  it("apiFetch throws generic error when body has no message", async () => {
    apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(apiModule.api.get("/server-error")).rejects.toThrow("API error: 500");
  });

  it("apiFetch throws on network error", async () => {
    apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network offline"));

    await expect(apiModule.api.get("/anything")).rejects.toThrow("Network offline");
  });

  it("clearTokens removes access and refresh tokens", () => {
    apiModule.setTokens({ accessToken: "at", refreshToken: "rt" });
    expect(apiModule.getAccessToken()).toBe("at");
    expect(apiModule.hasStoredRefreshToken()).toBe(true);

    apiModule.clearTokens();

    expect(apiModule.getAccessToken()).toBeNull();
    expect(apiModule.hasStoredRefreshToken()).toBe(false);
  });

  it("api.delete sends DELETE method", async () => {
    apiModule.setTokens({ accessToken: "at", refreshToken: "rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true }),
    } as Response);

    await apiModule.api.delete("/items/1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("api.put sends PUT with body", async () => {
    apiModule.setTokens({ accessToken: "at", refreshToken: "rt" });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ updated: true }),
    } as Response);

    await apiModule.api.put("/items/1", { name: "Updated" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Updated" }),
      }),
    );
  });
});
