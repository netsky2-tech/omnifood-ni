import { describe, it, expect, vi } from "vitest";
import { shouldRetryQuery, computeRetryDelay } from "@/lib/query-retry";
import { ApiError, clearTokens, setTokens, getAccessToken, onAuthExpired, notifyAuthExpired } from "@/lib/api";

describe("Resilience, Partial Failures & Session Handling Audit (Frentes 7 & 8)", () => {
  describe("Smart Retry Strategy", () => {
    it("never retries terminal HTTP errors (400, 401, 403, 404, 422)", () => {
      const terminalStatuses = [400, 401, 403, 404, 422];

      for (const status of terminalStatuses) {
        const error = new ApiError("Client Error", { status });
        const shouldRetry = shouldRetryQuery(0, error);
        expect(shouldRetry, `Expected status ${status} NOT to be retried`).toBe(false);
      }
    });

    it("retries transient server errors (500, 502, 503, 504) and network drops up to 2 attempts", () => {
      const transientStatuses = [500, 502, 503, 504];

      for (const status of transientStatuses) {
        const error = new ApiError("Server Error", { status });
        // Attempt 0 -> true
        expect(shouldRetryQuery(0, error)).toBe(true);
        // Attempt 1 -> true
        expect(shouldRetryQuery(1, error)).toBe(true);
        // Attempt 2 -> false (budget exhausted)
        expect(shouldRetryQuery(2, error)).toBe(false);
      }

      // Plain Network/Fetch Error
      const networkError = new TypeError("Failed to fetch");
      expect(shouldRetryQuery(0, networkError)).toBe(true);
      expect(shouldRetryQuery(1, networkError)).toBe(true);
      expect(shouldRetryQuery(2, networkError)).toBe(false);
    });

    it("computes exponential backoff with a 10-second ceiling", () => {
      expect(computeRetryDelay(0)).toBe(1000);
      expect(computeRetryDelay(1)).toBe(2000);
      expect(computeRetryDelay(2)).toBe(4000);
      expect(computeRetryDelay(3)).toBe(8000);
      expect(computeRetryDelay(4)).toBe(10000); // capped at 10s
      expect(computeRetryDelay(10)).toBe(10000); // capped at 10s
    });
  });

  describe("Session Lifecycle & Multi-Tab Expiration", () => {
    it("notifies auth expired listeners and clears storage on terminal auth failure", () => {
      setTokens({ accessToken: "valid-acc", refreshToken: "valid-ref" });
      expect(getAccessToken()).toBe("valid-acc");

      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      clearTokens();
      notifyAuthExpired();

      expect(getAccessToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });
});
