import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SetupCenterView } from "@/features/onboarding/setup-center-view";
import { OnboardingLifecycleState } from "@/features/onboarding/types";
import { useAuthStore } from "@/features/auth/auth-store";
import { UserRole } from "@/features/users/types";
import { setTokens, clearTokens } from "@/lib/api";

/**
 * Issue #556 stage 12c — "Vincular Terminal" surface (Setup Center).
 *
 * Covers the owner-facing generation of a single-use terminal linking code
 * (POST /onboarding/activation/linking-codes) through the existing data layer
 * (useGenerateLinkingCode): the plaintext code is rendered prominently with
 * its single-use warning and expiry countdown, failures use the established
 * error surface, and the button is disabled while the request is pending.
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

/**
 * URL-based fetch routing, mirroring the conventions of
 * onboarding-activation-attempt-surface.test.tsx. The linking-code POST is
 * routed separately so each test decides its outcome; the GET listing
 * (issue #569 polling via useLinkingCodes) returns an empty array so the
 * polling query never falls into the POST generation fallback.
 */
function routeFetch(options: {
  generateLinkingCodeResponse?: { status: number; body: unknown };
  onGenerateLinkingCode?: () => Promise<Response>;
}) {
  fetchSpy.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const isPost = init?.method === "POST" || (input instanceof Request && input.method === "POST");
    const okJson = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    if (url.includes("/onboarding/activation/linking-codes")) {
      if (!isPost) {
        // GET is the issue #569 listing of this tenant's linking codes.
        return okJson([]);
      }
      if (options.onGenerateLinkingCode) {
        return options.onGenerateLinkingCode();
      }
      const response = options.generateLinkingCodeResponse;
      return okJson(response?.body ?? {}, response?.status ?? 200);
    }
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
      return okJson(null);
    }
    return okJson({});
  });
}

function sentLinkingCodePosts(): Array<{ url: string; body: unknown }> {
  return fetchSpy.mock.calls
    .filter(
      (call) =>
        String(call[0]).includes("/onboarding/activation/linking-codes") &&
        (call[1]?.method ?? "GET") === "POST",
    )
    .map((call) => ({
      url: String(call[0]),
      body: call[1]?.body === undefined ? undefined : JSON.parse(String(call[1].body)),
    }));
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

function makeLinkingCodeResponse() {
  return {
    code: "WQ9X7K",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

describe("Issue #556 stage 12c — Vincular Terminal (Setup Center)", () => {
  it("generates a linking code with no body and renders it prominently with the single-use warning and expiry", async () => {
    authUser(UserRole.OWNER);
    const payload = makeLinkingCodeResponse();
    routeFetch({
      generateLinkingCodeResponse: { status: 201, body: payload },
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    await user.click(screen.getByTestId("generate-linking-code-btn"));

    const display = await screen.findByTestId("terminal-linking-code-display");
    expect(screen.getByTestId("terminal-linking-code-value")).toHaveTextContent("WQ9X7K");
    // Single-use warning is spelled out for the owner.
    expect(
      within(display).getByText(/un solo uso y expira en 15 minutos/i),
    ).toBeInTheDocument();
    // Expiry timestamp and countdown are shown while the code is alive.
    expect(screen.getByTestId("terminal-linking-expiry")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-linking-countdown")).toHaveTextContent(/^\d{2}:\d{2}$/);

    // Exactly the backend contract: POST with NO body. Tenant and actor
    // identity come from the Bearer JWT, never from the payload.
    const posts = sentLinkingCodePosts();
    expect(posts).toHaveLength(1);
    const post = posts[0];
    expect(post?.url).toContain("/onboarding/activation/linking-codes");
    expect(post?.body).toBeUndefined();
  });

  it("maps a backend permission failure to its business message while keeping the backend text", async () => {
    authUser(UserRole.OWNER);
    routeFetch({
      generateLinkingCodeResponse: {
        status: 403,
        body: {
          statusCode: 403,
          message: "Permission denied: onboarding:activation:manage",
        },
      },
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    await user.click(screen.getByTestId("generate-linking-code-btn"));

    const errorBox = await screen.findByTestId("terminal-linking-error");
    expect(errorBox).toHaveTextContent(/no tiene permiso/i);
    // Backend text stays available for support diagnostics.
    expect(screen.getByTestId("terminal-linking-error-backend")).toHaveTextContent(
      "Permission denied: onboarding:activation:manage",
    );
    // No code is rendered after a failure.
    expect(screen.queryByTestId("terminal-linking-code-display")).not.toBeInTheDocument();
  });

  it("disables the button while the generation request is pending", async () => {
    authUser(UserRole.OWNER);
    let resolvePost: ((response: Response) => void) | undefined;
    routeFetch({
      onGenerateLinkingCode: () =>
        new Promise<Response>((resolve) => {
          resolvePost = resolve;
        }),
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    const button = screen.getByTestId("generate-linking-code-btn");
    await user.click(button);

    await waitFor(() => {
      expect(sentLinkingCodePosts()).toHaveLength(1);
    });
    expect(button).toBeDisabled();

    // Release the pending request so the test ends cleanly.
    resolvePost?.(
      new Response(JSON.stringify(makeLinkingCodeResponse()), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("terminal-linking-code-value")).toHaveTextContent("WQ9X7K");
    });
  });

  it("keeps the generated code visible until dismissed and restores the generate action after", async () => {
    authUser(UserRole.OWNER);
    const payload = makeLinkingCodeResponse();
    routeFetch({
      generateLinkingCodeResponse: { status: 201, body: payload },
    });
    const user = userEvent.setup();

    await renderSaleReadyCenter();

    await user.click(screen.getByTestId("generate-linking-code-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("terminal-linking-code-value")).toHaveTextContent("WQ9X7K");
    });

    // The code display is owner-dismissable only: no auto-hide exists, and the
    // countdown keeps ticking (real interval) while it stays on screen.
    await waitFor(
      () => {
        expect(screen.getByTestId("terminal-linking-code-display")).toBeInTheDocument();
      },
      { timeout: 1500 },
    );
    expect(screen.getByTestId("terminal-linking-code-display")).toBeInTheDocument();

    // Dismiss is the only owner-controlled way to remove the code.
    await user.click(screen.getByTestId("terminal-linking-dismiss-btn"));
    expect(screen.queryByTestId("terminal-linking-code-display")).not.toBeInTheDocument();
    // The generate action is available again after dismissal.
    expect(screen.getByTestId("generate-linking-code-btn")).toBeInTheDocument();
  });

  it("keeps the generate action unavailable without onboarding:activation:manage and shows the guard note", async () => {
    authUser(UserRole.CASHIER);
    routeFetch({});

    await renderSaleReadyCenter();

    expect(screen.getByTestId("generate-linking-code-btn")).toBeDisabled();
    expect(screen.getByTestId("terminal-linking-permission-guard-note")).toHaveTextContent(
      /onboarding:activation:manage/i,
    );
    // No request is issued and nothing can trigger the mutation.
    expect(sentLinkingCodePosts()).toHaveLength(0);
  });
});
