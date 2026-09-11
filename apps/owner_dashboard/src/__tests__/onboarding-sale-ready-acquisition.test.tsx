import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { FiscalSetupForm } from "@/features/settings/fiscal-setup-form";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
import { FiscalRegime } from "@/features/settings/types";
import { setTokens, clearTokens } from "@/lib/api";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({
  children,
  client = createTestQueryClient(),
}: {
  children: React.ReactNode;
  client?: QueryClient;
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

describe("ONB1.5 — Fiscal + Catalog Acquisition UX & SALE_READY Transition", () => {
  let serverSession: any;
  let serverReadiness: any;
  let serverFiscal: any;
  let serverCatalogSummary: any;
  let serverTemplates: any;

  beforeEach(() => {
    setTokens({ accessToken: "test-access-token", refreshToken: "test-refresh-token" });

    serverSession = {
      id: "session-1",
      tenantId: "tenant-alpha",
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: "2026-09-04T10:00:00.000Z",
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-04T10:00:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:00:00.000Z",
    };

    serverReadiness = {
      identity: {
        tenantExists: true,
        initialOwnerExists: true,
        ownerCanAuthenticate: true,
        tenantContextValid: true,
      },
      fiscal: {
        minimumConfigurationValid: false,
      },
      catalog: {
        sellableProductCount: 0,
        hasSellableProduct: false,
      },
      saleReady: false,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: ["FISCAL_CONFIGURATION_INCOMPLETE", "CATALOG_NO_SELLABLE_PRODUCTS"],
      warnings: [],
      evaluatedAt: "2026-09-04T10:00:00.000Z",
    };

    serverFiscal = {
      tenantId: "tenant-alpha",
      businessName: "",
      ruc: "",
      regime: FiscalRegime.CUOTA_FIJA,
      commercialFxSpread: 0.5,
      pricesIncludeTax: true,
    };

    serverCatalogSummary = {
      sellableProductCount: 0,
      hasSellableProduct: false,
      sampleProducts: [],
    };

    serverTemplates = [
      {
        id: "CAFETERIA",
        code: "CAFETERIA",
        name: "Cafetería & Coffee Shop",
        description: "Especialidad en bebidas de café",
        icon: "coffee",
        insumoCount: 3,
        productCount: 4,
        is_active: true,
        version: 1,
      },
      {
        id: "RETAIL_MINIMARKET",
        code: "RETAIL_MINIMARKET",
        name: "Retail & Minimarket",
        description: "Abarrotes y productos generales",
        icon: "shopping-bag",
        insumoCount: 0,
        productCount: 10,
        is_active: true,
        version: 1,
      },
    ];

    fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL, options?: RequestInit) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      const method = options?.method ?? "GET";

      if (urlStr.includes("/onboarding/session")) {
        return new Response(
          JSON.stringify({ session: serverSession, readiness: serverReadiness }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr.includes("/onboarding/readiness")) {
        return new Response(
          JSON.stringify(serverReadiness),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr.includes("/onboarding/catalog/summary")) {
        return new Response(
          JSON.stringify(serverCatalogSummary),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr.includes("/onboarding/catalog/manual-product") && method === "POST") {
        const body = JSON.parse((options?.body as string) || "{}");
        const newProduct = {
          id: "prod-manual-1",
          name: body.name,
          sellPrice: body.sellPrice,
          uom: body.uom || "UN",
          category_code: body.category_code || null,
          costStatus: "COST_PENDING" as const,
          is_active: true,
        };

        serverCatalogSummary.sellableProductCount = 1;
        serverCatalogSummary.hasSellableProduct = true;
        serverCatalogSummary.sampleProducts = [newProduct];

        serverReadiness.catalog.sellableProductCount = 1;
        serverReadiness.catalog.hasSellableProduct = true;
        serverReadiness.blockers = serverReadiness.blockers.filter(
          (b: string) => b !== "CATALOG_NO_SELLABLE_PRODUCTS",
        );

        if (serverReadiness.fiscal.minimumConfigurationValid) {
          serverReadiness.saleReady = true;
          serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
          serverSession.saleReadyFirstAt = new Date().toISOString();
        }

        return new Response(
          JSON.stringify({
            product: newProduct,
            session: serverSession,
            readiness: serverReadiness,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr.includes("/onboarding/fiscal-setup")) {
        if (method === "GET") {
          return new Response(
            JSON.stringify(serverFiscal),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (method === "POST") {
          const body = JSON.parse((options?.body as string) || "{}");
          serverFiscal = {
            ...serverFiscal,
            businessName: body.businessName,
            ruc: body.ruc,
            regime: body.regime,
            commercialFxSpread: body.commercialFxSpread,
            pricesIncludeTax: body.pricesIncludeTax,
            configuredAt: new Date().toISOString(),
          };

          serverReadiness.fiscal.minimumConfigurationValid = true;
          serverReadiness.fiscal.businessName = body.businessName;
          serverReadiness.blockers = serverReadiness.blockers.filter(
            (b: string) => b !== "FISCAL_CONFIGURATION_INCOMPLETE",
          );

          if (serverReadiness.catalog.sellableProductCount >= 1) {
            serverReadiness.saleReady = true;
            serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
            serverSession.saleReadyFirstAt = new Date().toISOString();
          }

          return new Response(
            JSON.stringify(serverFiscal),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      if (urlStr.includes("/onboarding/templates") && !urlStr.includes("/apply")) {
        return new Response(
          JSON.stringify(serverTemplates),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (urlStr.includes("/onboarding/templates/CAFETERIA/apply") && method === "POST") {
        serverCatalogSummary.sellableProductCount = 4;
        serverCatalogSummary.hasSellableProduct = true;
        serverReadiness.catalog.sellableProductCount = 4;
        serverReadiness.catalog.hasSellableProduct = true;
        serverReadiness.blockers = serverReadiness.blockers.filter(
          (b: string) => b !== "CATALOG_NO_SELLABLE_PRODUCTS",
        );

        if (serverReadiness.fiscal.minimumConfigurationValid) {
          serverReadiness.saleReady = true;
          serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
        }

        return new Response(
          JSON.stringify({
            tenantId: "tenant-alpha",
            templateCode: "CAFETERIA",
            productsCreated: 4,
            insumosCreated: 3,
            recipesCreated: 2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({}),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it("FiscalSetupForm clearly identifies non-persisted fields (phone, address) and preserves persisted DGI parameters (AC-04, AC-05)", async () => {
    serverFiscal = {
      tenantId: "tenant-alpha",
      businessName: "Café de Especialidad",
      ruc: "J0310000000000",
      regime: FiscalRegime.REGIMEN_GENERAL,
      commercialFxSpread: 0.5,
      pricesIncludeTax: true,
    };

    render(<FiscalSetupForm />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue("Café de Especialidad")).toBeInTheDocument();
    });

    // Verify non-persisted badges and notes are visible (AC-05)
    expect(screen.getByTestId("phone-non-persisted-badge")).toHaveTextContent("No persistido fiscalmente");
    expect(screen.getByTestId("address-non-persisted-badge")).toHaveTextContent("No persistido fiscalmente");
    expect(screen.getByTestId("phone-non-persisted-note")).toBeInTheDocument();
    expect(screen.getByTestId("address-non-persisted-note")).toBeInTheDocument();
  });

  it("Setup Center allows acquiring catalog via Manual Minimal Product and transitions to SALE_READY (AC-06, AC-07, AC-08, AC-27, AC-28)", async () => {
    // 1. Mark Fiscal as already valid
    serverReadiness.fiscal.minimumConfigurationValid = true;
    serverReadiness.blockers = ["CATALOG_NO_SELLABLE_PRODUCTS"];

    const user = userEvent.setup();
    render(<SetupCenterView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
      expect(screen.getByTestId("next-recommended-action")).toBeInTheDocument();
    });

    // 2. Open Catalog Acquisition Modal
    const acquireBtn = screen.getByTestId("open-catalog-acquisition-btn");
    await user.click(acquireBtn);

    expect(screen.getByTestId("catalog-acquisition-modal")).toBeInTheDocument();
    expect(screen.getByTestId("acquisition-choices")).toBeInTheDocument();

    // 3. Choose Manual Product
    const chooseManualBtn = screen.getByTestId("choose-manual-btn");
    await user.click(chooseManualBtn);

    expect(screen.getByTestId("manual-product-view")).toBeInTheDocument();

    // 4. Fill manual product details
    const nameInput = screen.getByTestId("manual-product-name-input");
    const priceInput = screen.getByTestId("manual-product-price-input");

    fireEvent.change(nameInput, { target: { value: "Café Americano 8oz" } });
    fireEvent.change(priceInput, { target: { value: "45" } });

    // 5. Submit Manual Product
    const form = screen.getByTestId("manual-product-form");
    fireEvent.submit(form);

    // 6. Verify transition to SALE_READY in Setup Center
    await waitFor(() => {
      expect(screen.getByTestId("sale-ready-review-card")).toBeInTheDocument();
      expect(screen.getByText("¡Listo para Venta (SALE_READY)!")).toBeInTheDocument();
    });

    expect(screen.getByText(/Catálogo Vendible Activo con Precio/i)).toBeInTheDocument();
    expect(screen.getByText(/BOH \(Stock\/Recetas\/Costos\): Opcional no bloqueante/i)).toBeInTheDocument();
  });

  it("Setup Center allows acquiring catalog via Industry Template (M3 safe writer, AC-11, AC-12, AC-50)", async () => {
    serverReadiness.fiscal.minimumConfigurationValid = true;
    serverReadiness.blockers = ["CATALOG_NO_SELLABLE_PRODUCTS"];

    const user = userEvent.setup();
    render(<SetupCenterView />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByTestId("catalog-step-action-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("catalog-step-action-btn"));

    expect(screen.getByTestId("choose-template-btn")).toBeInTheDocument();
    await user.click(screen.getByTestId("choose-template-btn"));

    expect(screen.getByTestId("template-selection-view")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("apply-template-btn-CAFETERIA")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("apply-template-btn-CAFETERIA"));

    await waitFor(() => {
      expect(screen.getByTestId("sale-ready-review-card")).toBeInTheDocument();
    });
  });
});
