import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
import { setTokens, clearTokens } from "@/lib/api";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe("ONB1.9A–D — BOH Progressive Readiness & Checklist in Setup Center", () => {
  const mockActivatedSessionWithPendingBoh = {
    session: {
      id: "session-onb-99",
      tenantId: "tenant-boh-1",
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: "2026-09-01T10:00:00.000Z",
      saleReadyFirstAt: "2026-09-02T12:00:00.000Z",
      activationStartedAt: "2026-09-03T15:00:00.000Z",
      activatedAt: "2026-09-04T16:00:00.000Z",
      firstSuccessfulSaleAt: "2026-09-04T16:05:00.000Z",
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-04T16:10:00.000Z",
      currentActivationAttemptId: "attempt-1",
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-04T16:10:00.000Z",
    },
    readiness: {
      identity: {
        tenantExists: true,
        initialOwnerExists: true,
        ownerCanAuthenticate: true,
        tenantContextValid: true,
      },
      fiscal: {
        minimumConfigurationValid: true,
        businessName: "Cafetín El Progreso",
        fiscalRegime: "GENERAL",
        taxRate: 15.0,
        pricesIncludeTax: true,
      },
      catalog: {
        sellableProductCount: 4,
        hasSellableProduct: true,
      },
      inventory: {
        inventoryReady: true,
        scope: "BASIC",
        warehouseCount: 1,
        trackedProductCount: 4,
        trackedInsumoCount: 0,
        itemsWithStockCount: 0,
        hasDefaultWarehouse: true,
        notes: ["INITIAL_STOCK_NOT_LOADED_OPTIONAL"],
      },
      costing: {
        costingReady: false,
        totalProducts: 4,
        knownCostCount: 1,
        pendingCostCount: 2,
        notApplicableCount: 1,
        items: [
          {
            productId: "p1",
            productName: "Café Negro",
            state: "KNOWN",
            value: 12.0,
            provenance: "MANUAL_INITIAL_PROVENANCE",
          },
          {
            productId: "p2",
            productName: "Torta de Maíz",
            state: "COST_PENDING",
            reason: "ZERO_COST_WITHOUT_INVENTORY_PROVENANCE",
            provenance: "NONE",
          },
          {
            productId: "p3",
            productName: "Refresco Natural",
            state: "COST_PENDING",
            reason: "ZERO_COST_WITHOUT_INVENTORY_PROVENANCE",
            provenance: "NONE",
          },
          {
            productId: "p4",
            productName: "Servicio Entrega",
            state: "NOT_APPLICABLE",
            reason: "SERVICE_OR_NON_INVENTORIABLE",
            provenance: "NONE",
          },
        ],
      },
      operations: {
        operationsReady: false,
        staffCount: 1,
        additionalStaffCount: 0,
        publishedRecipeCount: 0,
        supplierCount: 0,
        categoryCount: 1,
        details: {
          hasAdditionalStaff: false,
          hasPublishedRecipes: false,
          hasSuppliers: false,
          hasCategories: true,
        },
        notes: ["INITIAL_OWNER_ONLY_STAFF_OPTIONAL"],
      },
      saleReady: true,
      inventoryReady: true,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: ["COSTING_PENDING_PROVENANCE"],
      evaluatedAt: "2026-09-04T16:10:00.000Z",
    },
  };

  it("renders BOH Progressive Checklist with Inventory, Costing, and Operations adapters without revoking ACTIVATED (AC-07, AC-08, AC-40, AC-41)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockActivatedSessionWithPendingBoh,
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sellableProductCount: 4, hasSellableProduct: true, sampleProducts: [] }),
    });

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("boh-progressive-checklist")).toBeDefined();
    });

    // Verify Inventory Readiness Card (ONB1.9A)
    expect(screen.getByTestId("boh-inventory-card")).toBeDefined();
    expect(screen.getByText("Inventario & Almacenes")).toBeDefined();
    expect(screen.getByText("Stock en 0 no bloquea venta (AC-07, AC-40)")).toBeDefined();

    // Verify Costing Readiness Card (ONB1.9B)
    expect(screen.getByTestId("boh-costing-card")).toBeDefined();
    expect(screen.getByText("Costeo & Valorización")).toBeDefined();
    expect(screen.getByText("COST_PENDING no bloquea venta")).toBeDefined();
    expect(screen.getByText("2 pendiente(s)")).toBeDefined();
    expect(screen.getByText("1 conocido(s)")).toBeDefined();

    // Verify Operations Readiness Card (ONB1.9C)
    expect(screen.getByTestId("boh-operations-card")).toBeDefined();
    expect(screen.getByText("Operaciones & Enriquecimiento")).toBeDefined();
    expect(screen.getByText(/Staff adicional:\s*0/)).toBeDefined();

    // Verify Direct BOH Navigation Links without artificial imports (ONB1.9D)
    expect(screen.getByTestId("boh-link-inventory")).toBeDefined();
    expect(screen.getByTestId("boh-link-costing")).toBeDefined();
    expect(screen.getByTestId("boh-link-operations")).toBeDefined();

    // Verify ACTIVATED status remains prominent and unrevoked
    expect(screen.getByText("ACTIVATED")).toBeDefined();
  });
});
