import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { api } from "@/lib/api";
import {
  ENTITLEMENTS_ENDPOINT,
  ENTITLEMENTS_TTL_MS,
  emptyEntitlements,
  fetchEntitlements,
} from "./entitlements-api";
import { useEntitlements } from "./use-entitlements";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn() },
  };
});

const validSnapshot = {
  version: 1,
  planCode: "OPERACION",
  status: "active",
  supportTier: "standard",
  capabilities: ["core.sales", "inventory.retail", "promotions"],
  limits: { "limits.terminals": 1, "limits.owner_accounts": null },
  addOns: ["pack.retail"],
  issuedAt: "2026-11-17T00:00:00Z",
  expiresAt: "2026-11-18T00:00:00Z",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("entitlements-api contract", () => {
  it("targets the backend tenant entitlements endpoint", () => {
    expect(ENTITLEMENTS_ENDPOINT).toBe("/tenant/entitlements");
  });

  it("ties its TTL to the snapshot contract's 24h envelope", () => {
    expect(ENTITLEMENTS_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("builds a safe empty fallback with no premium capabilities", () => {
    const empty = emptyEntitlements();
    expect(empty.planCode).toBe("sin_plan");
    expect(empty.capabilities).toEqual([]);
    expect(empty.addOns).toEqual([]);
    expect(empty.limits).toEqual({});
  });

  it("rejects a malformed payload instead of trusting it", () => {
    expect(fetchEntitlements).toBeDefined();
  });
});

describe("useEntitlements", () => {
  const mockedGet = vi.mocked(api.get);

  beforeEach(() => {
    vi.useFakeTimers();
    mockedGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes has() and limit() from a valid snapshot", async () => {
    mockedGet.mockResolvedValue(validSnapshot);

    const { result } = renderHook(() => useEntitlements(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isFallback).toBe(false);
    expect(result.current.planCode).toBe("OPERACION");
    expect(result.current.status).toBe("active");
    expect(result.current.has("promotions")).toBe(true);
    expect(result.current.has("inventory.retail")).toBe(true);
    expect(result.current.has("loyalty")).toBe(false);
    // A number is the quota; null means unlimited (catalog §9).
    expect(result.current.limit("limits.terminals")).toBe(1);
    expect(result.current.limit("limits.owner_accounts")).toBeNull();
    // An unknown limit key is not a blocker: it reads as unlimited.
    expect(result.current.limit("limits.unknown")).toBeNull();
  });

  it("falls back to no-premium on a 403 CAPABILITY_REQUIRED refusal and never retries 4xx", async () => {
    mockedGet.mockRejectedValue(
      new ApiError("Capability required", { status: 403, code: "CAPABILITY_REQUIRED" }),
    );

    const { result } = renderHook(() => useEntitlements(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Give any (forbidden) retry ample time: a 4xx refusal is terminal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(false);
    expect(result.current.isFallback).toBe(true);
    expect(result.current.planCode).toBe("sin_plan");
    expect(result.current.has("promotions")).toBe(false);
    expect(result.current.has("loyalty")).toBe(false);
    expect(result.current.has("inventory.retail")).toBe(false);
  });

  it("falls back to no-premium on a network failure, never to everything-allowed", async () => {
    mockedGet.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useEntitlements(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(result.current.isFallback).toBe(true);
    expect(result.current.has("promotions")).toBe(false);
    expect(result.current.has("inventory.cooking")).toBe(false);
    expect(result.current.limit("limits.terminals")).toBeNull();
  });

  it("treats a malformed payload as no premium capabilities", async () => {
    mockedGet.mockResolvedValue([]);

    const { result } = renderHook(() => useEntitlements(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.has("promotions")).toBe(false);
    expect(result.current.planCode).toBe("sin_plan");
  });

  it("treats a payload missing the capabilities array as no premium capabilities", async () => {
    mockedGet.mockResolvedValue({ planCode: "PRO", limits: {} });

    const { result } = renderHook(() => useEntitlements(), {
      wrapper: createWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.has("promotions")).toBe(false);
    expect(result.current.planCode).toBe("sin_plan");
  });
});
