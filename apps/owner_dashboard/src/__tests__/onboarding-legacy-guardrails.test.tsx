import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
import { useAuthStore } from "@/features/auth/auth-store";
import { UserRole } from "@/features/users/types";
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

describe("ONB1.5D/E — Legacy Baseline & Visible Scope Guardrails", () => {
  let serverSession: any;
  let serverReadiness: any;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setTokens({ accessToken: "test-token", refreshToken: "test-refresh" });

    useAuthStore.setState({
      user: {
        id: "owner-legacy",
        email: "legacy@omnifood.ni",
        name: "Dueño Histórico",
        role: UserRole.OWNER,
        tenantId: "tenant-legacy",
        active: true,
      },
      tenant: {
        id: "tenant-legacy",
        name: "Comercio Histórico",
        slug: "comercio-historico",
        ruc: "J0310000002",
        active: true,
      },
      isAuthenticated: true,
      hydrated: true,
    });

    serverSession = {
      id: "session-legacy-1",
      tenantId: "tenant-legacy",
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: null, // Legacy: no reliable starting anchor
      saleReadyFirstAt: "2026-09-04T10:00:00.000Z",
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-04T10:00:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: false, // Legacy baseline: excluded from TTFSS metrics
      legacyBaseline: true,
      optimisticVersion: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
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
        businessName: "Comercio Histórico",
        fiscalRegime: "CUOTA_FIJA",
      },
      catalog: {
        sellableProductCount: 5,
        hasSellableProduct: true,
      },
      saleReady: true,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: [],
      evaluatedAt: "2026-09-04T10:00:00.000Z",
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

  it("identifies legacy baseline tenant with badge and does not fabricate false TTFSS metric (ONB1.5D)", async () => {
    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Explicit legacy badge in header
    const badge = screen.getByTestId("legacy-baseline-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Tenant Histórico/i);
    expect(badge).toHaveTextContent(/Sin métrica TTFSS/i);

    // Legacy baseline notice banner
    const legacyBanner = screen.getByTestId("legacy-baseline-banner");
    expect(legacyBanner).toBeInTheDocument();
    expect(within(legacyBanner).getByText(/Métrica TTFSS no aplicable/i)).toBeInTheDocument();
    expect(within(legacyBanner).getByText(/measurementEligible: false/i)).toBeInTheDocument();

    // Activation button is NOT blocked by legacy state
    const activationBtn = screen.getByTestId("start-pos-terminal-btn");
    expect(activationBtn).not.toBeDisabled();
  });

  it("displays visible scope guardrails preventing cloud drive / complex mapper scope creep (ONB1.5E)", async () => {
    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-scope-guardrails")).toBeInTheDocument();
    });

    const guardrails = screen.getByTestId("onboarding-scope-guardrails");
    expect(within(guardrails).getByText(/Límites de Alcance Normativo/i)).toBeInTheDocument();
    expect(within(guardrails).getByText(/Sin dependencias de almacenamiento en la nube/i)).toBeInTheDocument();
    expect(within(guardrails).getByText(/Sin obligatoriedad de insumos, recetas ni 4 CSVs complejos/i)).toBeInTheDocument();

    // Verify neither Google Drive nor Dropbox nor drag-and-drop mappers are rendered
    expect(screen.queryByText(/Google Drive/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dropbox/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/arrastrar y soltar/i)).not.toBeInTheDocument();
  });
});
