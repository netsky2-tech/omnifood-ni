import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("ONB1.2 — SetupCenterView Component (State-based Authority & Concurrency)", () => {
  const baseSessionResponse = {
    session: {
      id: "session-uuid-10",
      tenantId: "tenant-sc-1",
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: "2026-09-03T18:00:00.000Z",
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-03T18:05:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 3,
      createdAt: "2026-09-03T18:00:00.000Z",
      updatedAt: "2026-09-03T18:05:00.000Z",
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
        businessName: "Taquería El Pastor",
        fiscalRegime: "CUOTA_FIJA",
        taxRate: 0.0,
        pricesIncludeTax: true,
      },
      catalog: {
        sellableProductCount: 0,
        hasSellableProduct: false,
      },
      saleReady: false,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: ["CATALOG_NO_SELLABLE_PRODUCTS"],
      warnings: [],
      evaluatedAt: "2026-09-03T18:05:00.000Z",
    },
  };

  it("renders Setup Center with backend session & readiness as single source of truth", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(baseSessionResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    // Initial loading skeleton/spinner
    expect(screen.getByTestId("setup-center-loading")).toBeInTheDocument();

    // Data loaded
    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Lifecycle badge and version
    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("SETUP_IN_PROGRESS");
    expect(screen.getByTestId("optimistic-version-badge")).toHaveTextContent("v3");

    // Steps rendered according to readiness
    expect(screen.getByTestId("step-identity")).toHaveTextContent(/Verificado/i);
    expect(screen.getByTestId("step-fiscal")).toHaveTextContent(/Configurado/i);
    expect(screen.getByTestId("step-catalog")).toHaveTextContent(/Cargar Productos/i);
    expect(screen.getByTestId("step-activation")).toHaveTextContent(/Bloqueado/i);

    // Blockers listed
    expect(screen.getAllByText(/CATALOG_NO_SELLABLE_PRODUCTS/i).length).toBeGreaterThan(0);

    // Next recommended action points to Catalog
    expect(screen.getByTestId("next-recommended-action")).toHaveTextContent(/Cargar Primer Producto/i);
  });

  it("renders SALE_READY status with active Activation step for preconfigured tenants", async () => {
    const saleReadyResponse = {
      session: {
        ...baseSessionResponse.session,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: "2026-09-03T18:10:00.000Z",
        optimisticVersion: 4,
      },
      readiness: {
        ...baseSessionResponse.readiness,
        catalog: {
          sellableProductCount: 5,
          hasSellableProduct: true,
        },
        saleReady: true,
        blockers: [],
      },
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(saleReadyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("SALE_READY");
    expect(screen.getByTestId("step-catalog")).toHaveTextContent(/Listo/i);
    expect(screen.getByTestId("step-activation")).toHaveTextContent(/Activar POS/i);
    expect(screen.getByTestId("next-recommended-action")).toHaveTextContent(/Activar Terminal POS/i);
  });

  it("displays legacy baseline badge when session.legacyBaseline is true", async () => {
    const legacyResponse = {
      session: {
        ...baseSessionResponse.session,
        legacyBaseline: true,
        measurementEligible: false,
        onboardingStartedAt: null,
      },
      readiness: baseSessionResponse.readiness,
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(legacyResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByTestId("legacy-baseline-badge")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-baseline-badge")).toHaveTextContent(/Tenant Histórico/i);
  });

  it("renders concurrency conflict banner on VERSION_CONFLICT error with reconcile button", async () => {
    const user = userEvent.setup();

    // 1st call fails with 409 VERSION_CONFLICT
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 409,
          message: "VERSION_CONFLICT: Onboarding session was updated concurrently (expected version: 2)",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("version-conflict-banner")).toBeInTheDocument();
    });

    expect(screen.getByText(/Conflicto de concurrencia detectado/i)).toBeInTheDocument();

    // Next call succeeds with reloaded version 3
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(baseSessionResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Click reconcile / retry
    const retryBtn = screen.getByTestId("reconcile-session-button");
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByText(/v3/i)).toBeInTheDocument();
  });

  it("triangulates: triggers onNavigateToTab when clicking step action buttons", async () => {
    const user = userEvent.setup();
    const onNavigateSpy = vi.fn();

    const pendingFiscalResponse = {
      ...baseSessionResponse,
      readiness: {
        ...baseSessionResponse.readiness,
        fiscal: {
          minimumConfigurationValid: false,
        },
      },
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(pendingFiscalResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <TestWrapper>
        <SetupCenterView onNavigateToTab={onNavigateSpy} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    const fiscalActionBtn = screen.getByRole("button", { name: /Ir a Configuración Fiscal/i });
    await user.click(fiscalActionBtn);

    expect(onNavigateSpy).toHaveBeenCalledWith("fiscal");
  });

  it("triangulates: handles non-concurrency server errors with retry option", async () => {
    const user = userEvent.setup();

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ statusCode: 500, message: "Database connection failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Error al consultar sesión de Onboarding/i)).toBeInTheDocument();
      expect(screen.getByText(/Database connection failed/i)).toBeInTheDocument();
    });

    // Mock successful retry
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(baseSessionResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const retryBtn = screen.getByRole("button", { name: /Reintentar/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });
  });
});
