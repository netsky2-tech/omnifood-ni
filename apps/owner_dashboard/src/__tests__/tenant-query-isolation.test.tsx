import { describe, it, expect } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

describe("Tenant Query Isolation Invariant Test", () => {
  it("DEMONSTRATES FLAW: unpartitioned queryKey without tenantId allows delayed response from Tenant A to contaminate Tenant B", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let resolveTenantA: (val: any) => void = () => {};
    const tenantAPromise = new Promise((resolve) => {
      resolveTenantA = resolve;
    });

    // Simulated hook without tenantId in queryKey (current behavior)
    function useUnpartitionedSales(tenantId: string) {
      return useQuery({
        queryKey: ["sales", "dashboard"], // Missing tenantId!
        queryFn: () => {
          if (tenantId === "tenant-A") return tenantAPromise;
          return Promise.resolve({ grossSales: 50, tenant: "tenant-B" });
        },
      });
    }

    // Step 1: Render in Tenant A context
    const { result, rerender } = renderHook(
      ({ tenantId }) => useUnpartitionedSales(tenantId),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
        initialProps: { tenantId: "tenant-A" },
      }
    );

    // Query A is in flight (loading)
    expect(result.current.isLoading).toBe(true);

    // Step 3: Switch context to Tenant B
    rerender({ tenantId: "tenant-B" });

    // Step 5: Delayed response for Tenant A resolves with sensitive Tenant A data
    await act(async () => {
      resolveTenantA({ grossSales: 999999, tenant: "tenant-A-SECRET" });
    });

    // Step 6: Verify what Tenant B sees
    // Because queryKey was ["sales", "dashboard"] for both, Tenant A's delayed resolution
    // resolves the pending query promise for that exact query key!
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    
    // Contamination demonstrated: Tenant B receives Tenant A's data!
    expect((result.current.data as any)?.tenant).toBe("tenant-A-SECRET");
  });

  it("VERIFIES INVARIANT: partitioned queryKey with tenantId guarantees Tenant A data NEVER contaminates Tenant B", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    let resolveTenantA: (val: any) => void = () => {};
    const tenantAPromise = new Promise((resolve) => {
      resolveTenantA = resolve;
    });

    // Correct partitioned hook with tenantId in queryKey
    function usePartitionedSales(tenantId: string) {
      return useQuery({
        queryKey: ["sales", tenantId, "dashboard"], // Explicitly partitioned!
        queryFn: () => {
          if (tenantId === "tenant-A") return tenantAPromise;
          return Promise.resolve({ grossSales: 50, tenant: "tenant-B" });
        },
      });
    }

    // Step 1: Render in Tenant A context
    const { result, rerender } = renderHook(
      ({ tenantId }) => usePartitionedSales(tenantId),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
        initialProps: { tenantId: "tenant-A" },
      }
    );

    expect(result.current.isLoading).toBe(true);

    // Step 3: Switch context to Tenant B
    rerender({ tenantId: "tenant-B" });

    // Tenant B immediately transitions to its own query key
    await waitFor(() => {
      expect((result.current.data as any)?.tenant).toBe("tenant-B");
    });

    // Step 5: Delayed response for Tenant A arrives now
    await act(async () => {
      resolveTenantA({ grossSales: 999999, tenant: "tenant-A-SECRET" });
    });

    // Step 6: Verify Tenant B still has only Tenant B data
    expect((result.current.data as any)?.tenant).toBe("tenant-B");
    expect((result.current.data as any)?.grossSales).toBe(50);

    // Tenant A's data is isolated in its own cache entry and NEVER displayed to Tenant B
    const tenantACache = queryClient.getQueryData(["sales", "tenant-A", "dashboard"]);
    expect((tenantACache as any)?.tenant).toBe("tenant-A-SECRET");
  });
});
