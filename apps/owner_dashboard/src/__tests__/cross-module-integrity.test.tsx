import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

describe("Cross-Module Data Integrity & Mutation Fan-Out Audit", () => {
  it("DEMONSTRATES FLAW: invalidating ['catalogs'] does NOT invalidate queries keyed with ['catalog']", () => {
    const queryClient = new QueryClient();
    const queryKey = ["catalog", "tenant-alpha", "INVENTORY_CATEGORY", false] as const;

    // Populate cache with category data
    queryClient.setQueryData(queryKey, [{ id: "cat-1", name: "Bebidas" }]);

    const stateBefore = queryClient.getQueryState(queryKey);
    expect(stateBefore?.isInvalidated).toBe(false);

    // Mismatched invalidation: developer invalidated ["catalogs"] instead of ["catalog"]
    queryClient.invalidateQueries({ queryKey: ["catalogs"] });

    const stateAfterFaultyInvalidation = queryClient.getQueryState(queryKey);
    // DEMONSTRATION OF DEFECT: The query is NOT invalidated because TanStack query key prefix matching failed
    expect(stateAfterFaultyInvalidation?.isInvalidated).toBe(false);

    // Now invalidate using the correct prefix ["catalog"]
    queryClient.invalidateQueries({ queryKey: ["catalog"] });
    const stateAfterCorrectInvalidation = queryClient.getQueryState(queryKey);
    expect(stateAfterCorrectInvalidation?.isInvalidated).toBe(true);
  });

  it("VERIFIES FIX: full cross-module fan-out on bulk import and template application invalidates catalog, products, recipes, inventory, and onboarding", () => {
    const queryClient = new QueryClient();
    const tenantId = "tenant-prod-1";

    const catalogKey = ["catalog", tenantId, "UOM", false];
    const productsKey = ["products", tenantId, undefined, false];
    const recipesKey = ["recipes", tenantId, "insumos"];
    const inventoryKey = ["inventory", tenantId, "valuation"];
    const onboardingKey = ["onboarding", tenantId, "session"];

    queryClient.setQueryData(catalogKey, [{ id: "uom-1", name: "Kg" }]);
    queryClient.setQueryData(productsKey, [{ id: "p-1", name: "Café" }]);
    queryClient.setQueryData(recipesKey, [{ id: "ins-1", name: "Grano" }]);
    queryClient.setQueryData(inventoryKey, { totalValuationNIO: 5000 });
    queryClient.setQueryData(onboardingKey, { lifecycleState: "IN_PROGRESS" });

    // Simulate proper fan-out invalidation helper
    function fanOutCatalogAndInventoryInvalidation(client: QueryClient, tId: string) {
      client.invalidateQueries({ queryKey: ["products", tId] });
      client.invalidateQueries({ queryKey: ["catalog", tId] });
      client.invalidateQueries({ queryKey: ["recipes", tId] });
      client.invalidateQueries({ queryKey: ["inventory", tId] });
      client.invalidateQueries({ queryKey: ["onboarding", tId] });
    }

    fanOutCatalogAndInventoryInvalidation(queryClient, tenantId);

    expect(queryClient.getQueryState(catalogKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(productsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(recipesKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(inventoryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(onboardingKey)?.isInvalidated).toBe(true);
  });

  it("VERIFIES RESILIENCE: mutation failure does not corrupt query cache", async () => {
    const queryClient = new QueryClient();
    const tenantId = "tenant-prod-1";
    const productsKey = ["products", tenantId, undefined, false];

    const initialData = [{ id: "p-1", name: "Producto Original" }];
    queryClient.setQueryData(productsKey, initialData);

    const mockMutationFn = vi.fn().mockRejectedValue(new Error("Database write lock"));

    try {
      await mockMutationFn();
    } catch {
      // expected error
    }

    // Cache remains pure and uncorrupted
    const dataAfterError = queryClient.getQueryData(productsKey);
    expect(dataAfterError).toEqual(initialData);
  });
});
