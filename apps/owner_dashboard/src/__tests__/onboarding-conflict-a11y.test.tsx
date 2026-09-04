import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CatalogAcquisitionModal } from "@/features/onboarding/catalog-acquisition-modal";
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

describe("ONB1.5F — Accessibility, Stale States & Version Conflict UX Preserving Inputs", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setTokens({ accessToken: "test-token", refreshToken: "test-refresh" });

    useAuthStore.setState({
      user: {
        id: "owner-conflict",
        email: "owner@omnifood.ni",
        name: "Carlos Dueño",
        role: UserRole.OWNER,
        tenantId: "tenant-conflict",
        active: true,
      },
      tenant: {
        id: "tenant-conflict",
        name: "Comercio Conflicto",
        slug: "comercio-conflicto",
        ruc: "J0310000003",
        active: true,
      },
      isAuthenticated: true,
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearTokens();
  });

  it("handles VERSION_CONFLICT (409) gracefully in manual product form without clearing user inputs", async () => {
    const user = userEvent.setup();
    let manualCallCount = 0;

    fetchSpy = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url.includes("/onboarding/catalog/manual-product") && method === "POST") {
        manualCallCount++;
        if (manualCallCount === 1) {
          // 1st attempt: 409 Conflict with VERSION_CONFLICT code
          return Promise.resolve(
            new Response(
              JSON.stringify({
                statusCode: 409,
                code: "VERSION_CONFLICT",
                message: "Optimistic lock conflict: onboarding session was updated concurrently",
              }),
              {
                status: 409,
                statusText: "Conflict",
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }

        // 2nd attempt: Success
        return Promise.resolve(
          new Response(
            JSON.stringify({
              product: {
                id: "prod-saved-1",
                name: "Torta Tres Leches 8oz",
                sellPrice: 120.0,
                costStatus: "COST_PENDING",
              },
              session: {
                id: "session-1",
                lifecycleState: OnboardingLifecycleState.SALE_READY,
                optimisticVersion: 2,
              },
            }),
            {
              status: 201,
              statusText: "Created",
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url.includes("/onboarding/templates")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    global.fetch = fetchSpy;

    const onOpenChange = vi.fn();

    render(
      <TestWrapper>
        <CatalogAcquisitionModal open={true} onOpenChange={onOpenChange} />
      </TestWrapper>,
    );

    // Navigate to manual method
    const manualBtn = screen.getByTestId("choose-manual-btn");
    await user.click(manualBtn);

    // Form should be rendered
    const nameInput = screen.getByTestId("manual-product-name-input");
    const priceInput = screen.getByTestId("manual-product-price-input");

    // Type input values
    fireEvent.change(nameInput, { target: { value: "Torta Tres Leches 8oz" } });
    fireEvent.change(priceInput, { target: { value: "120" } });

    // Submit form -> triggers 409 Conflict
    const form = screen.getByTestId("manual-product-form");
    fireEvent.submit(form);

    // Conflict alert must be displayed
    await waitFor(() => {
      expect(screen.getByTestId("manual-product-conflict-alert")).toBeInTheDocument();
    });

    const alert = screen.getByTestId("manual-product-conflict-alert");
    expect(within(alert).getByText(/Conflicto de concurrencia detectado/i)).toBeInTheDocument();

    // CRITICAL INVARIANT: User inputs must NOT be wiped
    expect(nameInput).toHaveValue("Torta Tres Leches 8oz");
    expect(priceInput).toHaveValue(120);

    // Re-submit without retyping
    fireEvent.submit(form);

    // Modal should close on success
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(manualCallCount).toBe(2);
  });

  it("applies accessible focus rings and semantic status indicators according to DESIGN_BACKOFFICE.md", async () => {
    fetchSpy = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/onboarding/session")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session: {
                id: "sess-a11y",
                lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
                optimisticVersion: 1,
                measurementEligible: true,
                legacyBaseline: false,
              },
              readiness: {
                identity: { tenantExists: true, initialOwnerExists: true, ownerCanAuthenticate: true },
                fiscal: { minimumConfigurationValid: false },
                catalog: { sellableProductCount: 0, hasSellableProduct: false },
                saleReady: false,
                blockers: ["FISCAL_MINIMUM_CONFIG_REQUIRED"],
                warnings: [],
                evaluatedAt: "2026-09-04T10:00:00.000Z",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    global.fetch = fetchSpy;

    render(
      <TestWrapper>
        <SetupCenterView />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("setup-center-view")).toBeInTheDocument();
    });

    // Check that interactive buttons use focus rings
    const fiscalBtn = screen.getByTestId("configure-fiscal-btn");
    expect(fiscalBtn.className).toMatch(/focus-visible:ring/);

    // Verify blockers section has semantic alert icon and text
    const blockers = screen.getByTestId("review-blockers-section");
    expect(within(blockers).getByText(/Bloqueadores Obligatorios/i)).toBeInTheDocument();
  });
});
