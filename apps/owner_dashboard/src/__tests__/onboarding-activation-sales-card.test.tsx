import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

describe("SetupCenterView — ONB1.9G Activation & First Customer Sale Observation", () => {
  const activatedSessionResponse = {
    session: {
      id: "session-uuid-activated",
      tenantId: "tenant-activated-1",
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: "2026-09-04T08:00:00.000Z",
      saleReadyFirstAt: "2026-09-04T08:30:00.000Z",
      activationStartedAt: "2026-09-04T09:00:00.000Z",
      activatedAt: "2026-09-04T12:05:00.000Z",
      firstSuccessfulSaleAt: "2026-09-04T12:00:00.000Z",
      firstCustomerSaleAt: "2026-09-04T14:45:00.000Z",
      lastActivityAt: "2026-09-04T14:45:00.000Z",
      currentActivationAttemptId: "att-activated-01",
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 8,
      createdAt: "2026-09-04T08:00:00.000Z",
      updatedAt: "2026-09-04T14:45:00.000Z",
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
        businessName: "Café El Retorno",
        fiscalRegime: "GENERAL",
        taxRate: 15.0,
        pricesIncludeTax: true,
      },
      catalog: {
        sellableProductCount: 5,
        hasSellableProduct: true,
      },
      inventory: {
        inventoryReady: true,
        scope: "BASIC",
        warehouseCount: 1,
        trackedProductCount: 5,
        trackedInsumoCount: 2,
        itemsWithStockCount: 2,
        hasDefaultWarehouse: true,
        notes: [],
      },
      costing: {
        costingReady: true,
        totalProducts: 5,
        knownCostCount: 5,
        pendingCostCount: 0,
        notApplicableCount: 0,
        items: [],
      },
      operations: {
        operationsReady: true,
        staffCount: 3,
        additionalStaffCount: 2,
        publishedRecipeCount: 2,
        supplierCount: 1,
        categoryCount: 2,
        details: {
          hasAdditionalStaff: true,
          hasPublishedRecipes: true,
          hasSuppliers: true,
          hasCategories: true,
        },
        notes: [],
      },
      saleReady: true,
      inventoryReady: true,
      costingReady: true,
      operationsReady: true,
      blockers: [],
      warnings: [],
      evaluatedAt: "2026-09-04T14:45:00.000Z",
    },
  };

  it("renders activation sales card showing consolidated TTFSS and decoupled First Customer Sale", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => activatedSessionResponse,
    });

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sellableProductCount: 5,
        insumoCount: 2,
        warehouseCount: 1,
      }),
    });

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    // 1. Activation sales card is rendered
    expect(await screen.findByTestId("onboarding-activation-sales-card")).toBeInTheDocument();

    // 2. Consolidated TTFSS claim is displayed
    const ttfssCard = screen.getByTestId("onboarding-ttfss-claim");
    expect(ttfssCard).toBeInTheDocument();
    expect(ttfssCard).toHaveTextContent("TTFSS Consolidado (Venta Técnica M6)");

    // 3. First Customer Sale is displayed
    const customerSaleCard = screen.getByTestId("onboarding-first-customer-sale");
    expect(customerSaleCard).toBeInTheDocument();
    expect(customerSaleCard).toHaveTextContent("Primer Ticket Comercial Cliente Final");
  });
});
