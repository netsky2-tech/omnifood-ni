import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "@/lib/api";

describe("W1 — API integration (fetch-level)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiModule.clearTokens();
    sessionStorage.clear();
    localStorage.clear();
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

  describe("Storage isolation — no localStorage token write/read fallback", () => {
    it("setTokens writes only to sessionStorage and never to localStorage", () => {
      apiModule.setTokens({ accessToken: "access-token-1", refreshToken: "refresh-token-1" });

      expect(sessionStorage.getItem("oc_access_token")).toBe("access-token-1");
      expect(sessionStorage.getItem("oc_refresh_token")).toBe("refresh-token-1");
      expect(localStorage.getItem("oc_access_token")).toBeNull();
      expect(localStorage.getItem("oc_refresh_token")).toBeNull();
    });

    it("does not fall back to localStorage tokens when sessionStorage is empty", () => {
      apiModule.clearTokens();
      sessionStorage.clear();
      localStorage.setItem("oc_access_token", "leaked-access");
      localStorage.setItem("oc_refresh_token", "leaked-refresh");

      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
      expect(apiModule.isAuthenticated()).toBe(false);
    });

    it("clearTokens removes tokens from sessionStorage without touching localStorage", () => {
      apiModule.setTokens({ accessToken: "token-a", refreshToken: "token-r" });
      localStorage.setItem("unrelated_app_setting", "theme-dark");

      apiModule.clearTokens();

      expect(sessionStorage.getItem("oc_access_token")).toBeNull();
      expect(sessionStorage.getItem("oc_refresh_token")).toBeNull();
      expect(localStorage.getItem("unrelated_app_setting")).toBe("theme-dark");
    });
  });

  describe("refreshAccessToken — supported response shapes", () => {
    it("accepts snake_case response shape and updates tokens", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "snake-new-access",
          refresh_token: "snake-new-refresh",
        }),
      } as Response);

      const refreshed = await apiModule.refreshAccessToken();

      expect(refreshed).toBe("snake-new-access");
      expect(apiModule.getAccessToken()).toBe("snake-new-access");
      expect(sessionStorage.getItem("oc_access_token")).toBe("snake-new-access");
      expect(sessionStorage.getItem("oc_refresh_token")).toBe("snake-new-refresh");
    });

    it("accepts camelCase response shape and updates tokens", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          accessToken: "camel-new-access",
          refreshToken: "camel-new-refresh",
        }),
      } as Response);

      const refreshed = await apiModule.refreshAccessToken();

      expect(refreshed).toBe("camel-new-access");
      expect(apiModule.getAccessToken()).toBe("camel-new-access");
      expect(sessionStorage.getItem("oc_access_token")).toBe("camel-new-access");
      expect(sessionStorage.getItem("oc_refresh_token")).toBe("camel-new-refresh");
    });

    it("accepts mixed snake_case and camelCase response shapes", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "mixed-access-token",
          refreshToken: "mixed-refresh-token",
        }),
      } as Response);

      const refreshed = await apiModule.refreshAccessToken();

      expect(refreshed).toBe("mixed-access-token");
      expect(apiModule.getAccessToken()).toBe("mixed-access-token");
      expect(sessionStorage.getItem("oc_access_token")).toBe("mixed-access-token");
      expect(sessionStorage.getItem("oc_refresh_token")).toBe("mixed-refresh-token");
    });
  });

  describe("refreshAccessToken — malformed/missing/blank token handling", () => {
    it("clears state and throws deterministic error when access token is empty string", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "", refresh_token: "valid-rt" }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
      expect(sessionStorage.getItem("oc_access_token")).toBeNull();
      expect(sessionStorage.getItem("oc_refresh_token")).toBeNull();
    });

    it("clears state and throws deterministic error when access token is whitespace only", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: "   \t\n  ", refreshToken: "valid-rt" }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when refresh token is empty string", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "valid-at", refresh_token: "" }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when refresh token is whitespace only", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ accessToken: "valid-at", refreshToken: "    " }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when access token is missing entirely", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ refresh_token: "valid-rt" }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when refresh token is missing entirely", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "valid-at" }),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when response is an empty object", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when response is a non-object payload", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ["token-in-array"],
      } as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("clears state and throws deterministic error when response json parsing throws", async () => {
      apiModule.setTokens({ accessToken: "old-at", refreshToken: "old-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      } as unknown as Response);

      await expect(apiModule.refreshAccessToken()).rejects.toThrow("Malformed refresh response");
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });
  });

  describe("Authorization header safety — no empty or whitespace Bearer headers", () => {
    it("never sends Authorization header when auth: false is specified", async () => {
      apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ public: true }),
      } as Response);

      await apiModule.apiFetch("/public-endpoint", { auth: false });

      const requestHeaders = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(requestHeaders.Authorization).toBeUndefined();
    });

    it("setTokens never persists empty or whitespace tokens and clears state", () => {
      apiModule.setTokens({ accessToken: "", refreshToken: "valid-rt" });
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
      expect(sessionStorage.getItem("oc_access_token")).toBeNull();

      apiModule.setTokens({ accessToken: "valid-at", refreshToken: "" });
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);

      apiModule.setTokens({ accessToken: "   ", refreshToken: "   " });
      expect(apiModule.getAccessToken()).toBeNull();
      expect(apiModule.hasStoredRefreshToken()).toBe(false);
    });

    it("never sends Authorization header with empty Bearer value even if custom headers pass Bearer with empty payload", async () => {
      apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await apiModule.apiFetch("/test", {
        headers: { Authorization: "Bearer " },
      });

      const requestHeaders = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(requestHeaders.Authorization).toBeUndefined();
    });
  });

  describe("Typed ApiError representation", () => {
    it("throws ApiError instance with status, statusCode, code, and responseBody on non-ok response", async () => {
      apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
      const errorPayload = {
        code: "BUSINESS_VALIDATION_ERROR",
        message: "Invalid inventory payload",
        details: { field: "quantity", expected: "> 0" },
      };
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => errorPayload,
      } as Response);

      try {
        await apiModule.apiFetch("/items/update");
        expect.unreachable("expected apiFetch to throw");
      } catch (error: unknown) {
        expect(apiModule.isApiError(error)).toBe(true);
        if (apiModule.isApiError(error)) {
          expect(error.name).toBe("ApiError");
          expect(error.status).toBe(422);
          expect(error.statusCode).toBe(422);
          expect(error.code).toBe("BUSINESS_VALIDATION_ERROR");
          expect(error.message).toBe("Invalid inventory payload");
          expect(error.responseBody).toEqual(errorPayload);
        }
      }
    });

    it("falls back to HTTP status message when responseBody has no message string", async () => {
      apiModule.setTokens({ accessToken: "valid-at", refreshToken: "valid-rt" });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "Service unavailable" }),
      } as Response);

      try {
        await apiModule.apiFetch("/items/update");
        expect.unreachable("expected apiFetch to throw");
      } catch (error: unknown) {
        expect(apiModule.isApiError(error)).toBe(true);
        if (apiModule.isApiError(error)) {
          expect(error.status).toBe(503);
          expect(error.statusCode).toBe(503);
          expect(error.message).toBe("API error: 503");
          expect(error.responseBody).toEqual({ error: "Service unavailable" });
        }
      }
    });
  });
});
