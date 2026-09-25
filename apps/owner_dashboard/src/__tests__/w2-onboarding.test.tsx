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
 * Issue #569 — single linking flow (dashboard).
 *
 * The owner generates a linking code; the POS claims it (binding the
 * device_id server-side); the setup center polls GET
 * /onboarding/activation/linking-codes, detects the CLAIMED code and offers
 * one-click activation for the claimed deviceId. The manual terminal-id
 * transcription input is GONE: an activation attempt can only be started
 * from a claimed code's bound deviceId.
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
      tenantId: "tenant-569",
      active: true,
    },
    tenant: {
      id: "tenant-569",
      name: "Food Park 569",
      slug: "food-park-569",
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
      id: "session-569",
      tenantId: "tenant-569",
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
    id: "attempt-569",
    tenantId: "tenant-569",
    onboardingSessionId: "session-569",
    candidateTerminalId: "POS-07",
    trustedTerminalId: null,
    status: ActivationAttemptStatus.CREATED,
    startedByUserId: "user-1",
    startedAt: "2026-09-05T11:00:00.000Z",
    completedAt: null,
    posBuild: null,
    warningsCount: 0,
    failureCode: null,
    idempotencyKey: "idem-569",
    createdAt: "2026-09-05T11:00:00.000Z",
    updatedAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

function makeLinkingCode(
  overrides: Partial<LinkingCodeResponse> = {},
): LinkingCodeResponse {
  return {
    id: "code-569",
    status: LinkingCodeStatus.CLAIMED,
    deviceId: "POS-07",
    expiresAt: "2026-09-05T11:15:00.000Z",
    claimedAt: "2026-09-05T11:05:00.000Z",
    createdAt: "2026-09-05T11:00:00.000Z",
    ...overrides,
  };
}

/**
 * URL-based fetch routing, mirroring the conventions of
 * onboarding-activation-attempt-surface.test.tsx. `activeAttemptSequence`
 * shifts one entry per GET to /attempts/active and repeats the last one (the
 * create mutation invalidates the active-attempt query, so the refetch sees
 * the new attempt). `linkingCodes` is returned on every GET of the listing
 * endpoint (polled every 5s by useLinkingCodes).
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
      // GET is the new #569 listing; POST is the #556 generation. Neither is
      // exercised via POST in this file, so the listing is safe to return.
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

describe("Issue #569 — single linking flow (Setup Center)", () => {
  it("removes the manual terminal-id input: activation can no longer be started by typing an id", async () => {
    authUser(UserRole.OWNER);
    routeFetch({});

    await renderSaleReadyCenter();

    expect(screen.queryByTestId("activation-terminal-id-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("create-activation-attempt-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activation-attempt-form")).not.toBeInTheDocument();
    // The flow hint now points at the automatic detection, not at typing ids.
    expect(screen.getByTestId("activation-hint")).toHaveTextContent(
      /código de vinculación/i,
    );
    expect(screen.getByTestId("terminal-detection-empty")).toHaveTextContent(
      /no hay terminales detectadas/i,
    );

    // No attempt can be created without a claimed device.
    expect(sentActivationPosts()).toHaveLength(0);
  });

  it("detects a claimed linking code and starts the attempt with its bound deviceId", async () => {
    authUser(UserRole.OWNER);
    const createdAttempt = makeAttempt({ candidateTerminalId: "POS-07" });
    routeFetch({
      linkingCodes: [
        makeLinkingCode({ id: "code-active", status: LinkingCodeStatus.ACTIVE, deviceId: null }),
        makeLinkingCode({ id: "code-claimed", status: LinkingCodeStatus.CLAIMED, deviceId: "POS-07" }),
      ],
      activeAttemptSequence: [null, createdAttempt],
      startAttemptResponse: { status: 201, body: createdAttempt },
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    const item = await screen.findByTestId("claimed-terminal-item");
    expect(screen.getByTestId("claimed-terminal-device-id")).toHaveTextContent("POS-07");

    await user.click(within(item).getByTestId("start-activation-for-terminal-btn"));

    await waitFor(() => {
      expect(sentActivationPosts()).toHaveLength(1);
    });
    const body = sentActivationPosts()[0] as Record<string, unknown>;
    // Exactly the data-layer DTO: the claimed deviceId + stable idempotency
    // key. Tenant and actor identity come from the JWT and must never be sent.
    expect(Object.keys(body).sort()).toEqual(["candidateTerminalId", "idempotencyKey"]);
    expect(body.candidateTerminalId).toBe("POS-07");
    expect(typeof body.idempotencyKey).toBe("string");

    // The existing attempt progress UI takes over after the create.
    expect(await screen.findByTestId("activation-awaiting-device-checks")).toHaveTextContent(
      "POS-07",
    );
  });

  it("never offers activation for ACTIVE codes or claims without a bound deviceId", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      linkingCodes: [
        makeLinkingCode({ id: "code-active", status: LinkingCodeStatus.ACTIVE, deviceId: null }),
        makeLinkingCode({ id: "code-claimed-no-device", status: LinkingCodeStatus.CLAIMED, deviceId: null }),
        makeLinkingCode({ id: "code-expired", status: LinkingCodeStatus.EXPIRED, deviceId: "POS-99" }),
      ],
    });

    await renderSaleReadyCenter();

    expect(screen.queryByTestId("claimed-terminal-item")).not.toBeInTheDocument();
    expect(screen.getByTestId("terminal-detection-empty")).toBeInTheDocument();
    expect(sentActivationPosts()).toHaveLength(0);
  });

  it("keeps the attempt progress UI and hides detection while an attempt awaits device checks", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      linkingCodes: [
        makeLinkingCode({ id: "code-claimed", status: LinkingCodeStatus.CLAIMED, deviceId: "POS-07" }),
      ],
      activeAttemptSequence: [makeAttempt({ status: ActivationAttemptStatus.CREATED })],
    });

    await renderSaleReadyCenter();

    const panel = await screen.findByTestId("activation-awaiting-device-checks");
    expect(panel).toHaveTextContent("POS-07");
    // No second activation can be started while this one is in progress.
    expect(screen.queryByTestId("terminal-detection-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-activation-for-terminal-btn")).not.toBeInTheDocument();
  });

  it("keeps the claimed-device retry path reachable after a failed attempt", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      linkingCodes: [
        makeLinkingCode({ id: "code-claimed", status: LinkingCodeStatus.CLAIMED, deviceId: "POS-07" }),
      ],
      activeAttemptSequence: [
        makeAttempt({ status: ActivationAttemptStatus.FAIL, failureCode: "DEVICE_CHECKS_FAILED" }),
      ],
    });

    await renderSaleReadyCenter();

    expect(await screen.findByTestId("activation-attempt-failed")).toBeInTheDocument();
    expect(screen.getByTestId("start-activation-for-terminal-btn")).toBeEnabled();
    expect(screen.queryByTestId("activation-terminal-id-input")).not.toBeInTheDocument();
  });

  it("disables the one-click activation without onboarding:activation:manage", async () => {
    authUser(UserRole.CASHIER);
    routeFetch({
      linkingCodes: [
        makeLinkingCode({ id: "code-claimed", status: LinkingCodeStatus.CLAIMED, deviceId: "POS-07" }),
      ],
    });

    await renderSaleReadyCenter();

    expect(screen.getByTestId("start-activation-for-terminal-btn")).toBeDisabled();
    expect(screen.getByTestId("terminal-linking-permission-guard-note")).toHaveTextContent(
      /onboarding:activation:manage/i,
    );
    expect(sentActivationPosts()).toHaveLength(0);
  });
});
