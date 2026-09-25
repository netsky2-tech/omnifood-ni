import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import {
  ActivationAttemptStatus,
  LinkingCodeStatus,
  OnboardingLifecycleState,
  type ActivationAttempt,
  type LinkingCodeResponse,
} from "@/features/onboarding/types";
import { useAuthStore } from "@/features/auth/auth-store";
import { UserRole } from "@/features/users/types";
import { setTokens, clearTokens } from "@/lib/api";

/**
 * L1-04b — Activation attempt creation surface (Setup Center).
 *
 * Covers the interactive creation of an activation attempt from the owner
 * dashboard using the existing data layer (useStartActivationAttempt /
 * useActiveActivationAttempt). No check results, finalization or credentials:
 * the dashboard only creates the attempt and surfaces the awaiting state.
 */

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
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
  useAuthStore.setState({
    user: null,
    tenant: null,
    isAuthenticated: false,
    hydrated: false,
  });
});

function authUser(role: UserRole) {
  useAuthStore.setState({
    user: {
      id: "user-1",
      email: "user@omnifood.ni",
      name: "Usuario Test",
      role,
      tenantId: "tenant-l104b",
      active: true,
    },
    tenant: {
      id: "tenant-l104b",
      name: "Food Park L104b",
      slug: "food-park-l104b",
      ruc: "J0310000000001X",
      active: true,
    },
    isAuthenticated: true,
    hydrated: true,
  });
}

function saleReadySessionResponse() {
  return {
    session: {
      id: "session-l104b",
      tenantId: "tenant-l104b",
      lifecycleState: OnboardingLifecycleState.SALE_READY,
      onboardingStartedAt: "2026-09-05T10:00:00.000Z",
      saleReadyFirstAt: "2026-09-05T10:30:00.000Z",
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-05T10:30:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
      createdAt: "2026-09-05T10:00:00.000Z",
      updatedAt: "2026-09-05T10:30:00.000Z",
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
        businessName: "Fritanga La Jefa",
        fiscalRegime: "CUOTA_FIJA",
        taxRate: 0.0,
        pricesIncludeTax: true,
      },
      catalog: {
        sellableProductCount: 3,
        hasSellableProduct: true,
      },
      saleReady: true,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: [],
      warnings: [],
      evaluatedAt: "2026-09-05T10:30:00.000Z",
    },
  };
}

function makeAttempt(
  overrides: Partial<ActivationAttempt> = {},
): ActivationAttempt {
  return {
    id: "attempt-l104b",
    tenantId: "tenant-l104b",
    onboardingSessionId: "session-l104b",
    candidateTerminalId: "POS-01",
    trustedTerminalId: null,
    status: ActivationAttemptStatus.CREATED,
    startedByUserId: "user-1",
    startedAt: "2026-09-05T11:00:00.000Z",
    completedAt: null,
    posBuild: null,
    warningsCount: 0,
    failureCode: null,
    idempotencyKey: "idem-l104b",
    createdAt: "2026-09-05T11:00:00.000Z",
    updatedAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

function makeClaimedCode(
  overrides: Partial<LinkingCodeResponse> = {},
): LinkingCodeResponse {
  return {
    id: "code-l104b-claimed",
    status: LinkingCodeStatus.CLAIMED,
    deviceId: "POS-01",
    expiresAt: "2026-09-05T11:15:00.000Z",
    claimedAt: "2026-09-05T11:05:00.000Z",
    createdAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

/**
 * URL-based fetch routing, mirroring the conventions of
 * onboarding-sale-ready-review.test.tsx but exposing the activation attempt
 * behavior needed for this slice. `activeAttemptSequence` shifts one entry per
 * GET to /attempts/active and repeats the last one (the create mutation
 * invalidates the active-attempt query, so the refetch sees the new attempt).
 * `linkingCodes` is returned on every GET of the listing endpoint (polled
 * every 5s by useLinkingCodes, issue #569 single linking flow).
 */
function routeFetch(options: {
  activeAttemptSequence?: Array<ActivationAttempt | null>;
  linkingCodes?: LinkingCodeResponse[];
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
      return okJson(saleReadySessionResponse());
    }
    if (url.includes("/onboarding/catalog/summary")) {
      return okJson({
        sellableProductCount: 3,
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
    if (url.includes("/onboarding/activation/linking-codes")) {
      // GET is the issue #569 listing; POST is the #556 generation. This file
      // only exercises the GET listing.
      return okJson(options.linkingCodes ?? []);
    }
    return okJson({});
  });
}

function sentActivationPosts(): Array<Record<string, unknown>> {
  return fetchSpy.mock.calls
    .filter((call) => String(call[0]).includes("/onboarding/activation/attempts") &&
      (call[1]?.method ?? "GET") === "POST")
    .map((call) => JSON.parse(String(call[1]?.body)));
}

async function renderSaleReadyCenter() {
  render(
    <TestWrapper>
      <SetupCenterView />
    </TestWrapper>,
  );
  await waitFor(() => {
    expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
  });
}

describe("L1-04b — Activation Attempt Creation Surface (Setup Center)", () => {
  it("keeps the activation action unavailable without onboarding:activation:manage and shows the guard note", async () => {
    authUser(UserRole.CASHIER);
    routeFetch({});

    await renderSaleReadyCenter();

    expect(screen.getByTestId("start-pos-terminal-btn")).toHaveClass("opacity-60");
    expect(screen.queryByTestId("claimed-terminal-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-activation-for-terminal-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("activation-permission-guard-note")).toHaveTextContent(
      /onboarding:activation:manage/i,
    );

    // No request is issued and nothing can trigger the mutation.
    const posts = sentActivationPosts();
    expect(posts).toHaveLength(0);
  });

  it("offers the one-click activation for a claimed terminal to a user with onboarding:activation:manage", async () => {
    authUser(UserRole.OWNER);
    routeFetch({ linkingCodes: [makeClaimedCode()] });

    await renderSaleReadyCenter();

    expect(await screen.findByTestId("claimed-terminal-item")).toBeInTheDocument();
    expect(screen.getByTestId("claimed-terminal-device-id")).toHaveTextContent("POS-01");
    expect(screen.getByTestId("start-activation-for-terminal-btn")).toBeEnabled();
    expect(screen.getByTestId("activation-hint")).toBeInTheDocument();
  });

  it("creates the attempt from the claimed deviceId with exactly the expected body and surfaces the awaiting state", async () => {
    authUser(UserRole.OWNER);
    const createdAttempt = makeAttempt();
    routeFetch({
      linkingCodes: [makeClaimedCode()],
      activeAttemptSequence: [null, createdAttempt],
      startAttemptResponse: { status: 201, body: createdAttempt },
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    const item = await screen.findByTestId("claimed-terminal-item");
    await user.click(within(item).getByTestId("start-activation-for-terminal-btn"));

    await waitFor(() => {
      expect(sentActivationPosts()).toHaveLength(1);
    });

    const posts = sentActivationPosts();
    expect(posts).toHaveLength(1);
    const body = posts[0] as Record<string, unknown>;
    // Exactly the data-layer DTO: the claimed code's bound deviceId + stable
    // idempotency key. Tenant and actor identity come from the JWT and must
    // never be sent.
    expect(Object.keys(body).sort()).toEqual(["candidateTerminalId", "idempotencyKey"]);
    expect(body.candidateTerminalId).toBe(makeClaimedCode().deviceId);
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey).toBeTruthy();

    expect(await screen.findByTestId("activation-awaiting-device-checks")).toHaveTextContent(
      "POS-01",
    );
    // The dashboard has no check results: none must be rendered.
    const panel = screen.getByTestId("activation-awaiting-device-checks");
    expect(within(panel).queryByText(/PASS|FAIL/i)).not.toBeInTheDocument();
  });

  it.each([
    ActivationAttemptStatus.CREATED,
    ActivationAttemptStatus.IN_PROGRESS,
  ])(
    "renders the awaiting-device-checks state when the active attempt is %s",
    async (status) => {
      authUser(UserRole.OWNER);
      routeFetch({
        activeAttemptSequence: [makeAttempt({ status })],
      });

      await renderSaleReadyCenter();

      const panel = await screen.findByTestId("activation-awaiting-device-checks");
      expect(panel).toHaveTextContent("POS-01");
      expect(panel).toHaveTextContent(/terminal/i);
      // The create form is not needed: the next step happens on the terminal.
      expect(screen.queryByTestId("create-activation-attempt-btn")).not.toBeInTheDocument();
      // No check results exist on the dashboard side.
      expect(within(panel).queryByText(/PASS|FAIL/i)).not.toBeInTheDocument();
    },
  );

  it("surfaces a failed attempt with its outcome and keeps a retry path", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      linkingCodes: [makeClaimedCode()],
      activeAttemptSequence: [
        makeAttempt({ status: ActivationAttemptStatus.FAIL, failureCode: "DEVICE_CHECKS_FAILED" }),
      ],
    });

    await renderSaleReadyCenter();

    const panel = await screen.findByTestId("activation-attempt-failed");
    expect(panel).toHaveTextContent(/\bfall\w*/i);
    expect(panel).toHaveTextContent(/terminal.*revisada antes de intentar/i);
    // The operator may retry via the claimed-device one-click path: the
    // detection list stays reachable, never replaced by a bare form without
    // the previous outcome explained.
    expect(screen.getByTestId("start-activation-for-terminal-btn")).toBeEnabled();
    expect(screen.queryByTestId("activation-terminal-id-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activation-awaiting-device-checks")).not.toBeInTheDocument();
    // The dashboard does not fetch checks: no check data may be rendered.
    expect(within(panel).queryByText(/PASS|FAIL/i)).not.toBeInTheDocument();
  });

  it("surfaces a passed-with-warning attempt and asks the operator to review the warnings", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      activeAttemptSequence: [
        makeAttempt({ status: ActivationAttemptStatus.PASS_WITH_WARNING, warningsCount: 2 }),
      ],
    });

    await renderSaleReadyCenter();

    const panel = await screen.findByTestId("activation-attempt-passed-with-warning");
    expect(panel).toHaveTextContent(/advertencias/i);
    expect(panel).toHaveTextContent(/deben ser revisadas/i);
    expect(screen.queryByTestId("activation-awaiting-device-checks")).not.toBeInTheDocument();
    // The dashboard does not fetch checks: no check data may be rendered.
    expect(within(panel).queryByText(/PASS|FAIL/i)).not.toBeInTheDocument();
  });

  it.each([
    [
      400,
      "CANNOT_START_ACTIVATION_NOT_SALE_READY: Onboarding session is in 'SETUP_IN_PROGRESS' state, but must be 'SALE_READY'",
      /no está Listo para Venta/i,
    ],
    [
      409,
      "ACTIVE_ATTEMPT_EXISTS: An activation attempt (attempt-l104b) is already active in status 'IN_PROGRESS'",
      /Ya existe una activación en curso/i,
    ],
    [
      400,
      "FISCAL_REVISION_NOT_AVAILABLE: Cannot pin fiscal revision",
      /configuración fiscal/i,
    ],
    [
      400,
      "No sellable verification product candidate found for tenant",
      /producto de verificación/i,
    ],
    [
      403,
      "Permission denied: onboarding:activation:manage",
      /no tiene permiso/i,
    ],
  ])(
    "maps backend failure %s '%s' to its own business message while keeping the backend text",
    async (status, backendMessage, expectedPattern) => {
      authUser(UserRole.OWNER);
      routeFetch({
        linkingCodes: [makeClaimedCode()],
        startAttemptResponse: { status, body: { statusCode: status, message: backendMessage } },
      });
      const user = userEvent.setup();

      await renderSaleReadyCenter();

      const item = await screen.findByTestId("claimed-terminal-item");
      await user.click(within(item).getByTestId("start-activation-for-terminal-btn"));

      const errorBox = await screen.findByTestId("activation-attempt-error");
      expect(errorBox).toHaveTextContent(expectedPattern);
      // Backend text stays available for support diagnostics.
      expect(screen.getByTestId("activation-attempt-error-backend")).toHaveTextContent(
        backendMessage,
      );
    },
  );
});
