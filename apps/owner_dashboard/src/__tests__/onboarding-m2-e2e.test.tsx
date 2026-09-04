import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { SettingsPage } from "@/features/settings/settings-page";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
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

describe("ONB1.2 M2 E2E — State-based Setup Center Foundation & Concurrency", () => {
  // Shared backend state for tenant
  let serverSession: {
    id: string;
    tenantId: string;
    lifecycleState: OnboardingLifecycleState;
    onboardingStartedAt: string | null;
    saleReadyFirstAt: string | null;
    activationStartedAt: string | null;
    activatedAt: string | null;
    firstSuccessfulSaleAt: string | null;
    firstCustomerSaleAt: string | null;
    lastActivityAt: string | null;
    currentActivationAttemptId: string | null;
    measurementEligible: boolean;
    legacyBaseline: boolean;
    optimisticVersion: number;
    createdAt: string;
    updatedAt: string;
  };

  let serverReadiness: {
    identity: {
      tenantExists: boolean;
      initialOwnerExists: boolean;
      ownerCanAuthenticate: boolean;
      tenantContextValid: boolean;
    };
    fiscal: {
      minimumConfigurationValid: boolean;
      businessName?: string;
      fiscalRegime?: string;
      taxRate?: number;
      pricesIncludeTax?: boolean;
    };
    catalog: {
      sellableProductCount: number;
      hasSellableProduct: boolean;
    };
    saleReady: boolean;
    inventoryReady: boolean;
    costingReady: boolean;
    operationsReady: boolean;
    blockers: string[];
    warnings: string[];
    evaluatedAt: string;
  };

  beforeEach(() => {
    serverSession = {
      id: "session-e2e-1",
      tenantId: "tenant-e2e-alpha",
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: "2026-09-03T10:00:00.000Z",
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-03T10:00:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: "2026-09-03T10:00:00.000Z",
      updatedAt: "2026-09-03T10:00:00.000Z",
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
      evaluatedAt: "2026-09-03T10:00:00.000Z",
    };

    setTokens({ accessToken: "owner-e2e-token", refreshToken: "owner-e2e-refresh" });

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (method === "GET" && url.endsWith("/api/onboarding/session")) {
        return new Response(
          JSON.stringify({
            session: serverSession,
            readiness: serverReadiness,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (method === "GET" && url.endsWith("/api/onboarding/readiness")) {
        return new Response(JSON.stringify(serverReadiness), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it("rehydrates session and readiness cleanly across simulated browser refreshes without ephemeral state", async () => {
    // 1st render (Tab 1 / Initial visit)
    const client1 = createTestQueryClient();
    const { unmount } = render(
      <TestWrapper client={client1}>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Check step status
    expect(screen.getByTestId("step-identity")).toHaveTextContent(/Verificado/i);
    expect(screen.getByTestId("step-fiscal")).toHaveTextContent(/Configurar Fiscal/i);
    expect(screen.getByTestId("step-catalog")).toHaveTextContent(/Cargar Productos/i);
    expect(screen.getByTestId("step-activation")).toHaveTextContent(/Bloqueado/i);
    expect(screen.getByTestId("optimistic-version-badge")).toHaveTextContent("v1");

    // Unmount simulates closing tab or refresh
    unmount();

    // In the background, server state mutates (e.g. Fiscal configured)
    serverReadiness.fiscal = {
      minimumConfigurationValid: true,
      businessName: "Taquería Los Hermanos",
      fiscalRegime: "CUOTA_FIJA",
      taxRate: 0.0,
      pricesIncludeTax: true,
    };
    serverReadiness.blockers = ["CATALOG_NO_SELLABLE_PRODUCTS"];
    serverSession.optimisticVersion = 2;
    serverSession.lastActivityAt = "2026-09-03T10:15:00.000Z";

    // 2nd render simulates re-opening dashboard in new device or tab
    const client2 = createTestQueryClient();
    render(
      <TestWrapper client={client2}>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Progress rehydrates accurately from backend truth: Fiscal is now COMPLETED without artificial clicks!
    expect(screen.getByTestId("step-fiscal")).toHaveTextContent(/Configurado/i);
    expect(screen.getByTestId("step-catalog")).toHaveTextContent(/Cargar Productos/i);
    expect(screen.getByTestId("optimistic-version-badge")).toHaveTextContent("v2");
  });

  it("handles two-tab concurrency and VERSION_CONFLICT with graceful reload and reconciliation", async () => {
    const user = userEvent.setup();

    // Tab 1 loads initial state at version 1
    const tab1Client = createTestQueryClient();
    render(
      <TestWrapper client={tab1Client}>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });
    expect(screen.getByTestId("optimistic-version-badge")).toHaveTextContent("v1");

    // Tab 2 or assisted support updates session in backend (advancing optimisticVersion to 2)
    serverSession.optimisticVersion = 2;
    serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
    serverSession.saleReadyFirstAt = "2026-09-03T10:20:00.000Z";
    serverReadiness.fiscal.minimumConfigurationValid = true;
    serverReadiness.catalog = {
      sellableProductCount: 12,
      hasSellableProduct: true,
    };
    serverReadiness.saleReady = true;
    serverReadiness.blockers = [];

    // Tab 1 now triggers an action or refresh that receives 409 VERSION_CONFLICT
    fetchSpy.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          statusCode: 409,
          message: "VERSION_CONFLICT: Onboarding session session-e2e-1 was updated concurrently (expected version: 1)",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    });

    // Tab 1 triggers refresh
    const refreshBtn = screen.getByRole("button", { name: /Actualizar/i });
    await user.click(refreshBtn);

    // Tab 1 renders concurrency warning banner
    await waitFor(() => {
      expect(screen.getByTestId("version-conflict-banner")).toBeInTheDocument();
    });
    expect(screen.getByText(/Conflicto de concurrencia detectado \(VERSION_CONFLICT\)/i)).toBeInTheDocument();

    // Tab 1 clicks reconcile
    const reconcileBtn = screen.getByTestId("reconcile-session-button");
    await user.click(reconcileBtn);

    // Tab 1 reconciles to version 2 with updated SALE_READY status
    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("SALE_READY");
    expect(screen.getByTestId("optimistic-version-badge")).toHaveTextContent("v2");
    expect(screen.getByTestId("step-fiscal")).toHaveTextContent(/Configurado/i);
    expect(screen.getByTestId("step-catalog")).toHaveTextContent(/Listo/i);
    expect(screen.getByTestId("step-activation")).toHaveTextContent(/Activar POS/i);
  });

  it("SettingsPage renders Setup Center M2 and maintains full backward compatibility with W9", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SettingsPage initialTab="setup" />
      </TestWrapper>,
    );

    // Setup Center panel is rendered
    await waitFor(() => {
      expect(screen.getByTestId("tabpanel-setup")).toBeInTheDocument();
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Seamless navigation to Fiscal tab
    await user.click(screen.getByTestId("tab-fiscal"));
    expect(screen.getByTestId("tabpanel-fiscal")).toBeInTheDocument();

    // Seamless navigation to Templates tab
    await user.click(screen.getByTestId("tab-templates"));
    expect(screen.getByTestId("tabpanel-templates")).toBeInTheDocument();

    // Seamless navigation to Import tab
    await user.click(screen.getByTestId("tab-import"));
    expect(screen.getByTestId("tabpanel-import")).toBeInTheDocument();

    // Return to Setup Center
    await user.click(screen.getByTestId("tab-setup"));
    expect(screen.getByTestId("tabpanel-setup")).toBeInTheDocument();
  });
});
