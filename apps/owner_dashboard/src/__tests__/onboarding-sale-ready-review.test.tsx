import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
import { useAuthStore } from "@/features/auth/auth-store";
import { UserRole, AppPermission } from "@/features/users/types";
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

describe("ONB1.5C — Sale Ready Review Detallado & Activation Permission Gate", () => {
  let serverSession: any;
  let serverReadiness: any;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setTokens({ accessToken: "test-token", refreshToken: "test-refresh" });

    // Set Owner as default user in AuthStore
    useAuthStore.setState({
      user: {
        id: "owner-1",
        email: "owner@omnifood.ni",
        name: "Carlos Dueño",
        role: UserRole.OWNER,
        tenantId: "tenant-review",
        active: true,
      },
      tenant: {
        id: "tenant-review",
        name: "Comercio Review",
        slug: "comercio-review",
        ruc: "J0310000001",
        active: true,
      },
      isAuthenticated: true,
      hydrated: true,
    });

    serverSession = {
      id: "session-review-1",
      tenantId: "tenant-review",
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
        minimumConfigurationValid: true,
        businessName: "Comercio Review",
        fiscalRegime: "CUOTA_FIJA",
      },
      catalog: {
        sellableProductCount: 2,
        hasSellableProduct: true,
      },
      saleReady: true,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: ["REGIME_SPECIAL_LIMIT_VERIFY"],
      evaluatedAt: "2026-09-04T10:05:00.000Z",
    };

    fetchSpy = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/onboarding/session")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            session: serverSession,
            readiness: serverReadiness,
          }),
        });
      }

      if (url.includes("/onboarding/catalog/summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sellableProductCount: serverReadiness.catalog.sellableProductCount,
            hasSellableProduct: serverReadiness.catalog.hasSellableProduct,
            sampleProducts: [],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearTokens();
  });

  it("differentiates blockers, warnings, and optional BOH items in Sale Ready Review", async () => {
    serverReadiness.saleReady = false;
    serverReadiness.blockers = ["CATALOG_NO_SELLABLE_PRODUCTS"];
    serverReadiness.warnings = ["FISCAL_REGIME_ANNUAL_DECLARATION_PENDING"];

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    // Wait for view to render
    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Review card or blockers/warnings sections should be visible
    expect(screen.getByTestId("sale-ready-review-card")).toBeInTheDocument();
    const blockersSection = screen.getByTestId("review-blockers-section");
    expect(blockersSection).toBeInTheDocument();
    expect(within(blockersSection).getByText(/CATALOG_NO_SELLABLE_PRODUCTS/i)).toBeInTheDocument();

    // Warnings section
    const warningsSection = screen.getByTestId("review-warnings-section");
    expect(warningsSection).toBeInTheDocument();
    expect(within(warningsSection).getByText(/FISCAL_REGIME_ANNUAL_DECLARATION_PENDING/i)).toBeInTheDocument();

    // Optional BOH section with explicit non-blocking note (AC-07, AC-08, AC-28)
    expect(screen.getByTestId("review-optional-boh-section")).toBeInTheDocument();
    expect(screen.getByText(/Stock inicial /i)).toBeInTheDocument();
    expect(screen.getByText(/Recetas & Escandallos/i)).toBeInTheDocument();
  });

  it("displays historical milestone when saleReadyFirstAt is present", async () => {
    serverSession.saleReadyFirstAt = "2026-09-04T10:05:00.000Z";
    serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("historical-milestone-banner")).toBeInTheDocument();
    });

    expect(screen.getByText(/Hito Histórico/i)).toBeInTheDocument();
    expect(screen.getByTestId("historical-milestone-banner")).toHaveTextContent("2026");
  });

  it("shows degraded live state warning while preserving historical milestone when isSaleReadyNow becomes false", async () => {
    // Tenant previously reached sale ready, but currently lost its sellable product
    serverSession.saleReadyFirstAt = "2026-09-04T10:05:00.000Z";
    serverSession.lifecycleState = OnboardingLifecycleState.SETUP_IN_PROGRESS;
    serverReadiness.saleReady = false;
    serverReadiness.blockers = ["CATALOG_NO_SELLABLE_PRODUCTS"];

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("historical-milestone-banner")).toBeInTheDocument();
      expect(screen.getByTestId("degraded-live-state-alert")).toBeInTheDocument();
    });

    const degradedAlert = screen.getByTestId("degraded-live-state-alert");
    expect(within(degradedAlert).getByText(/Preparación temporalmente degradada/i)).toBeInTheDocument();
    expect(within(degradedAlert).getByText(/CATALOG_NO_SELLABLE_PRODUCTS/i)).toBeInTheDocument();
  });

  it("enables 'Iniciar Terminal POS' CTA only when current user has onboarding:activation:manage permission", async () => {
    serverSession.lifecycleState = OnboardingLifecycleState.SALE_READY;
    serverReadiness.saleReady = true;

    // 1. OWNER has permission: CTA must be enabled
    const { unmount } = render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      const btn = screen.getByTestId("start-pos-terminal-btn");
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    unmount();

    // 2. CASHIER without permission: CTA must be disabled with permission explanation
    useAuthStore.setState({
      user: {
        id: "cashier-1",
        email: "cashier@omnifood.ni",
        name: "Pedro Cajero",
        role: UserRole.CASHIER,
        tenantId: "tenant-review",
        active: true,
      },
      isAuthenticated: true,
      hydrated: true,
    });

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      const btn = screen.getByTestId("start-pos-terminal-btn");
      expect(btn).toBeInTheDocument();
      expect(btn).toBeDisabled();
      expect(screen.getByTestId("activation-permission-guard-note")).toHaveTextContent(
        /onboarding:activation:manage/i,
      );
    });
  });
});
