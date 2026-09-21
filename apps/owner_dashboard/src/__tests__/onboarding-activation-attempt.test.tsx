import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { type ReactNode } from "react";
import { setTokens, clearTokens, ApiError } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  onboardingKeys,
  useActiveActivationAttempt,
  useStartActivationAttempt,
} from "@/features/onboarding/use-onboarding";
import {
  ActivationAttemptStatus,
  type ActivationAttempt,
} from "@/features/onboarding/types";

let fetchSpy: ReturnType<typeof vi.fn>;
let queryClient: QueryClient;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "test-owner-token", refreshToken: "test-refresh-token" });
  useAuthStore.setState({
    user: {
      id: "u-owner",
      email: "owner@example.com",
      name: "Dueño",
      role: "OWNER",
      tenantId: "tenant-onb-1",
      active: true,
    },
    tenant: {
      id: "tenant-onb-1",
      name: "Food Park Test",
      slug: "food-park-test",
      ruc: "J0310000000001X",
      active: true,
    },
    isAuthenticated: true,
    hydrated: true,
  });
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockFetchSuccess(body: unknown, status = 200) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(status: number, message: string) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ message, statusCode: status }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const sampleAttempt: ActivationAttempt = {
  id: "attempt-uuid-1",
  tenantId: "tenant-onb-1",
  onboardingSessionId: "session-uuid-1",
  candidateTerminalId: "terminal-pos-01",
  trustedTerminalId: null,
  status: ActivationAttemptStatus.CREATED,
  startedByUserId: "u-owner",
  startedAt: "2026-09-03T19:00:00.000Z",
  completedAt: null,
  posBuild: "1.2.0",
  warningsCount: 0,
  failureCode: null,
  idempotencyKey: "idem-key-1",
  createdAt: "2026-09-03T19:00:00.000Z",
  updatedAt: "2026-09-03T19:00:00.000Z",
};

function sentBodies(): Array<Record<string, unknown>> {
  return fetchSpy.mock.calls
    .filter((call) => call[1]?.method === "POST")
    .map((call) => JSON.parse(String(call[1].body)));
}

describe("L1-04a — Activation Attempt Hooks (Data Layer)", () => {
  describe("useActiveActivationAttempt", () => {
    it("loads the active attempt through the activation attempt query key", async () => {
      mockFetchSuccess(sampleAttempt);

      const { result } = renderHook(() => useActiveActivationAttempt(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/onboarding/activation/attempts/active",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result.current.data?.id).toBe("attempt-uuid-1");
      expect(queryClient.getQueryState(onboardingKeys.activationAttempt())?.data).toBeTruthy();
    });

    it("exposes the backend error instead of swallowing it", async () => {
      mockFetchError(403, "Permission denied: onboarding:read");

      const { result } = renderHook(() => useActiveActivationAttempt(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(ApiError);
      expect((result.current.error as ApiError).message).toContain(
        "Permission denied: onboarding:read",
      );
    });
  });

  describe("useStartActivationAttempt", () => {
    it("creates an attempt and invalidates session, readiness and active-attempt queries", async () => {
      queryClient.setQueryData(onboardingKeys.session(), { stale: "session" });
      queryClient.setQueryData(onboardingKeys.readiness(), { stale: "readiness" });
      queryClient.setQueryData(onboardingKeys.activationAttempt(), { stale: "attempt" });

      mockFetchSuccess(sampleAttempt, 201);

      const { result } = renderHook(() => useStartActivationAttempt(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(queryClient.getQueryState(onboardingKeys.session())?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(onboardingKeys.readiness())?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(onboardingKeys.activationAttempt())?.isInvalidated).toBe(
        true,
      );
    });

    it("sends a stable idempotency key reused across retries of the same submission", async () => {
      mockFetchError(
        500,
        "Transient backend failure",
      );
      mockFetchSuccess(sampleAttempt, 201);

      const { result } = renderHook(() => useStartActivationAttempt(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" }),
        ).rejects.toThrow("Transient backend failure");
      });

      await act(async () => {
        await result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const bodies = sentBodies();
      expect(bodies).toHaveLength(2);
      const [firstBody, secondBody] = bodies;
      expect(firstBody?.idempotencyKey).toBeTruthy();
      expect(firstBody?.idempotencyKey).toBe(secondBody?.idempotencyKey);
      expect(secondBody?.candidateTerminalId).toBe("terminal-pos-01");
    });

    it("regenerates the idempotency key after a successful submission", async () => {
      mockFetchSuccess(sampleAttempt, 201);
      mockFetchSuccess(
        { ...sampleAttempt, id: "attempt-uuid-2", idempotencyKey: "idem-key-2" },
        201,
      );

      const { result } = renderHook(() => useStartActivationAttempt(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" });
      });
      await act(async () => {
        await result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" });
      });

      const bodies = sentBodies();
      expect(bodies).toHaveLength(2);
      const [firstBody, secondBody] = bodies;
      expect(firstBody?.idempotencyKey).toBeTruthy();
      expect(firstBody?.idempotencyKey).not.toBe(secondBody?.idempotencyKey);
    });

    it("regenerates the idempotency key when the terminal id changes", async () => {
      mockFetchError(
        400,
        "CANNOT_START_ACTIVATION_NOT_SALE_READY: Onboarding session is in 'SETUP_IN_PROGRESS' state, but must be 'SALE_READY'",
      );
      mockFetchSuccess(sampleAttempt, 201);

      const { result } = renderHook(() => useStartActivationAttempt(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({ candidateTerminalId: "terminal-pos-01" }),
        ).rejects.toThrow("CANNOT_START_ACTIVATION_NOT_SALE_READY");
      });

      await act(async () => {
        await result.current.mutateAsync({ candidateTerminalId: "terminal-pos-02" });
      });

      const bodies = sentBodies();
      expect(bodies).toHaveLength(2);
      const [firstBody, secondBody] = bodies;
      expect(firstBody?.candidateTerminalId).toBe("terminal-pos-01");
      expect(secondBody?.candidateTerminalId).toBe("terminal-pos-02");
      expect(firstBody?.idempotencyKey).not.toBe(secondBody?.idempotencyKey);
    });

    it.each([
      [400, "CANNOT_START_ACTIVATION_NOT_SALE_READY: Onboarding session is in 'SETUP_IN_PROGRESS' state, but must be 'SALE_READY'"],
      [409, "ACTIVE_ATTEMPT_EXISTS: An activation attempt (attempt-uuid-1) is already active in status 'IN_PROGRESS'"],
      [400, "FISCAL_REVISION_NOT_AVAILABLE: Cannot pin fiscal revision"],
      [403, "Permission denied: onboarding:activation:manage"],
    ])(
      "exposes documented failure %s to the caller with the backend message intact",
      async (status, message) => {
        mockFetchError(status, message);

        const { result } = renderHook(() => useStartActivationAttempt(), { wrapper });

        let caught: unknown = null;
        await act(async () => {
          caught = await result.current.mutateAsync({
            candidateTerminalId: "terminal-pos-01",
          }).catch((error: unknown) => error);
        });

        expect(caught).toBeInstanceOf(ApiError);
        expect((caught as ApiError).message).toContain(message);
        expect((caught as ApiError).status).toBe(status);
      },
    );
  });
});
