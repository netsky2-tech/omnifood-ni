import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import {
  ActivationAttemptStatus,
  OnboardingLifecycleState,
  type ActivationAttempt,
} from "@/features/onboarding/types";
import { useAuthStore } from "@/features/auth/auth-store";
import { UserRole } from "@/features/users/types";
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
    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("En Configuración");
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

    expect(screen.getByTestId("lifecycle-badge")).toHaveTextContent("Listo para Venta");
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

describe("L1-04b — SetupCenterView Activation Attempt Creation Surface", () => {
  const saleReadyResponse = {
    session: {
      id: "session-uuid-10",
      tenantId: "tenant-sc-1",
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: "2026-09-03T18:00:00.000Z",
      saleReadyFirstAt: "2026-09-03T18:10:00.000Z",
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-03T18:10:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 4,
      createdAt: "2026-09-03T18:00:00.000Z",
      updatedAt: "2026-09-03T18:10:00.000Z",
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
        sellableProductCount: 5,
        hasSellableProduct: true,
      },
      saleReady: true,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: [],
      evaluatedAt: "2026-09-03T18:10:00.000Z",
    },
  };

  afterEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      isAuthenticated: false,
      hydrated: false,
    });
  });

  function grantRole(role: UserRole) {
    useAuthStore.setState({
      user: {
        id: "user-sc-1",
        email: "user@omnifood.ni",
        name: "Usuario Setup Center",
        role,
        tenantId: "tenant-sc-1",
        active: true,
      },
      tenant: {
        id: "tenant-sc-1",
        name: "Taquería El Pastor",
        slug: "taqueria-el-pastor",
        ruc: "J0310000000001X",
        active: true,
      },
      isAuthenticated: true,
      hydrated: true,
    });
  }

  function routeFetch(options: {
    activeAttemptSequence?: Array<ActivationAttempt | null>;
    startAttemptResponse?: { status: number; body: unknown };
  }) {
    const sequence = options.activeAttemptSequence ?? [null];
    let activeCalls = 0;
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      const okJson = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      if (url.includes("/onboarding/session")) {
        return okJson(saleReadyResponse);
      }
      if (url.includes("/onboarding/catalog/summary")) {
        return okJson({
          sellableProductCount: 5,
          hasSellableProduct: true,
          sampleProducts: [],
        });
      }
      if (url.includes("/onboarding/activation/attempts/active")) {
        const index = Math.min(activeCalls, sequence.length - 1);
        activeCalls += 1;
        return okJson(sequence[index]);
      }
      if (url.includes("/onboarding/activation/attempts")) {
        const response = options.startAttemptResponse;
        return okJson(response?.body ?? {}, response?.status ?? 200);
      }
      return okJson({});
    });
  }

  function sentActivationPosts(): Array<Record<string, unknown>> {
    return fetchSpy.mock.calls
      .filter(
        (call) =>
          String(call[0]).includes("/onboarding/activation/attempts") &&
          (call[1]?.method ?? "GET") === "POST",
      )
      .map((call) => JSON.parse(String(call[1]?.body)));
  }

  it("shows the terminal id action and creates the attempt with the expected body", async () => {
    grantRole(UserRole.OWNER);
    const createdAttempt: ActivationAttempt = {
      id: "attempt-sc-1",
      tenantId: "tenant-sc-1",
      onboardingSessionId: "session-uuid-10",
      candidateTerminalId: "POS-07",
      trustedTerminalId: null,
      status: ActivationAttemptStatus.CREATED,
      startedByUserId: "user-sc-1",
      startedAt: "2026-09-03T19:00:00.000Z",
      completedAt: null,
      posBuild: null,
      warningsCount: 0,
      failureCode: null,
      idempotencyKey: "idem-sc-1",
      createdAt: "2026-09-03T19:00:00.000Z",
      updatedAt: "2026-09-03T19:00:00.000Z",
    };
    routeFetch({
      activeAttemptSequence: [null, createdAttempt],
      startAttemptResponse: { status: 201, body: createdAttempt },
    });
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByTestId("activation-terminal-id-input")).toBeInTheDocument();
    expect(screen.getByTestId("create-activation-attempt-btn")).toBeEnabled();

    await user.type(screen.getByTestId("activation-terminal-id-input"), "POS-07");
    await user.click(screen.getByTestId("create-activation-attempt-btn"));

    await waitFor(() => {
      expect(sentActivationPosts()).toHaveLength(1);
    });
    const body = sentActivationPosts()[0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["candidateTerminalId", "idempotencyKey"]);
    expect(body.candidateTerminalId).toBe("POS-07");

    expect(await screen.findByTestId("activation-awaiting-device-checks")).toHaveTextContent(
      "POS-07",
    );
  });

  it("does not issue a request when the terminal id is empty and tells the user why", async () => {
    grantRole(UserRole.OWNER);
    routeFetch({});
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("create-activation-attempt-btn"));

    expect(await screen.findByTestId("activation-terminal-id-error")).toHaveTextContent(
      /ID de terminal/i,
    );
    expect(sentActivationPosts()).toHaveLength(0);
  });

  it("keeps the action unavailable without the activation permission and shows the guard note", async () => {
    grantRole(UserRole.CASHIER);
    routeFetch({});

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    expect(screen.getByTestId("start-pos-terminal-btn")).toHaveClass("opacity-60");
    expect(screen.queryByTestId("activation-terminal-id-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-activation-attempt-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("activation-permission-guard-note")).toHaveTextContent(
      /onboarding:activation:manage/i,
    );
  });
});
