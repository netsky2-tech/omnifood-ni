import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/app/protected-route";
import { ROUTE_ROLE_PERMISSIONS } from "@/lib/rbac";
import { setTokens, clearTokens } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth-store";

function authUser(role: "OWNER" | "MANAGER" | "CASHIER" | "WAITER") {
  return {
    id: "u-1",
    email: "owner@test.com",
    name: "Owner",
    role,
    tenantId: "t-1",
    active: true,
  };
}

const snapshotWith = (capabilities: string[]) => ({
  version: 1,
  planCode: "OPERACION",
  status: "active",
  supportTier: "standard",
  capabilities,
  limits: {},
  addOns: [],
  issuedAt: "2026-11-17T00:00:00Z",
  expiresAt: "2026-11-18T00:00:00Z",
});

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/loyalty"
            element={
              <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/loyalty"]}>
                <div>LOYALTY_CONTENT</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/kardex"
            element={
              <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/kardex"]}>
                <div>KARDEX_CONTENT</div>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<div>OTHER_ROUTE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProtectedRoute premium gating (ENT-05b)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useAuthStore.setState({
      user: authUser("OWNER"),
      tenant: { id: "t-1", name: "T", slug: "t", ruc: "001", active: true },
      isAuthenticated: true,
      hydrated: true,
    });
    // apiFetch requires a session token before it will issue the request.
    setTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearTokens();
    useAuthStore.setState({ user: null, tenant: null, isAuthenticated: false, hydrated: false });
  });

  it("renders PremiumLocked instead of the page when the capability is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshotWith(["core.sales"])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderAt("/loyalty");

    await waitFor(() => {
      expect(
        screen.getByText(
          'La función requiere el plan o el complemento que incluye "loyalty". Actualice su plan para usarla.',
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("LOYALTY_CONTENT")).not.toBeInTheDocument();
  });

  it("renders the page when the capability is held", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshotWith(["core.sales", "loyalty"])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderAt("/loyalty");

    await waitFor(() => {
      expect(screen.getByText("LOYALTY_CONTENT")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Actualice su plan/)).not.toBeInTheDocument();
  });

  it("keeps the role denial as the existing redirect, never the upgrade copy", async () => {
    useAuthStore.setState({ user: authUser("CASHIER") });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshotWith([])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderAt("/kardex");

    await waitFor(() => {
      expect(screen.getByText("OTHER_ROUTE")).toBeInTheDocument();
    });
    expect(screen.queryByText("KARDEX_CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualice su plan/)).not.toBeInTheDocument();
  });

  it("shows a loading state, not a denial, while the snapshot is in flight", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderAt("/loyalty");

    expect(screen.getByTestId("premium-gate-loading")).toBeInTheDocument();
    expect(screen.queryByText("LOYALTY_CONTENT")).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualice su plan/)).not.toBeInTheDocument();
  });
});
