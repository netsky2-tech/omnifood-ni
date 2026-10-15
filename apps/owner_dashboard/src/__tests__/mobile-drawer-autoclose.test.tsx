import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/app/layout/sidebar";
import { useUiStore } from "@/features/auth/ui-store";
import { useAuthStore } from "@/features/auth/auth-store";
import type { Tenant, User } from "@/types";

const mockUser: User = {
  id: "u-1",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER",
  tenantId: "t-1",
  active: true,
};

const mockTenant: Tenant = {
  id: "t-1",
  name: "Test Tenant",
  slug: "test-tenant",
  ruc: "000-000-0000",
  active: true,
};

describe("Mobile Drawer Auto-Close on Navigation (#509)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.getState().login(mockUser, mockTenant);
    useUiStore.setState({ mobileSidebarOpen: false });
  });

  afterEach(() => {
    useAuthStore.getState().logout();
    useUiStore.setState({ mobileSidebarOpen: false });
  });

  it("closes the mobile drawer on query-string-only navigation", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/products",
          element: (
            <QueryClientProvider client={queryClient}>
              <Sidebar />
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ["/products?page=1"] },
    );

    render(<RouterProvider router={router} />);

    // Open mobile drawer
    act(() => {
      useUiStore.setState({ mobileSidebarOpen: true });
    });
    expect(useUiStore.getState().mobileSidebarOpen).toBe(true);

    // Navigate to a different query string with the SAME pathname
    await act(async () => {
      await router.navigate("/products?page=2");
    });

    // In bug #509, the effect depended on location.pathname so the drawer remained open.
    // It should auto-close when location.key changes.
    expect(useUiStore.getState().mobileSidebarOpen).toBe(false);
  });
});
