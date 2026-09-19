import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ProtectedRoute } from "@/app/protected-route";
import { MenuQrPage } from "@/features/menu-qr/menu-qr-page";
import { useAuthStore } from "@/features/auth/auth-store";
import { ROUTE_ROLE_PERMISSIONS, canAccessRoute } from "@/lib/rbac";
import type { User, UserRole } from "@/types";

/**
 * Route/RBAC integration coverage for the menu QR feature: the dedicated
 * `/menu-qr` route must exist in the authoritative route permission map,
 * grant access only to OWNER and MANAGER, and enforce that contract through
 * the shared ProtectedRoute redirect behavior.
 */

const LOGIN_FALLBACK = "login-fallback";
const DASHBOARD_FALLBACK = "dashboard-fallback";
const PROMOTIONS_FALLBACK = "promotions-fallback";

function userWithRole(role: UserRole): User {
  return {
    id: "usr-test-01",
    email: "owner@nhilos.com",
    name: "Sofía Martínez",
    role,
    tenantId: "tenant-soho-01",
    active: true,
  };
}

function renderMenuQrRoute() {
  return render(
    <MemoryRouter initialEntries={["/menu-qr"]}>
      <Routes>
        <Route
          path="/menu-qr"
          element={
            <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/menu-qr"]}>
              <MenuQrPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div>{DASHBOARD_FALLBACK}</div>} />
        <Route
          path="/promotions"
          element={<div>{PROMOTIONS_FALLBACK}</div>}
        />
        <Route path="/login" element={<div>{LOGIN_FALLBACK}</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("menu QR route permissions", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      isAuthenticated: false,
      hydrated: true,
    });
  });

  it("maps /menu-qr to OWNER and MANAGER only in the authoritative route table", () => {
    expect(ROUTE_ROLE_PERMISSIONS["/menu-qr"]).toEqual(["OWNER", "MANAGER"]);
  });

  it("allows OWNER and MANAGER through canAccessRoute and denies staff roles", () => {
    expect(canAccessRoute("OWNER", "/menu-qr")).toBe(true);
    expect(canAccessRoute("MANAGER", "/menu-qr")).toBe(true);
    expect(canAccessRoute("CASHIER", "/menu-qr")).toBe(false);
    expect(canAccessRoute("WAITER", "/menu-qr")).toBe(false);
  });

  it("renders the menu QR page for an authenticated OWNER", () => {
    useAuthStore.setState({
      user: userWithRole("OWNER"),
      isAuthenticated: true,
    });

    renderMenuQrRoute();

    expect(
      screen.getByRole("heading", { name: "QR del menú" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("URL del menú")).toBeInTheDocument();
  });

  it("renders the menu QR page for an authenticated MANAGER", () => {
    useAuthStore.setState({
      user: userWithRole("MANAGER"),
      isAuthenticated: true,
    });

    renderMenuQrRoute();

    expect(
      screen.getByRole("heading", { name: "QR del menú" }),
    ).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    renderMenuQrRoute();

    expect(
      screen.queryByRole("heading", { name: "QR del menú" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(LOGIN_FALLBACK)).toBeInTheDocument();
  });

  it.each(["CASHIER", "WAITER"] as UserRole[])(
    "redirects %s to the default role route instead of the page",
    async (role) => {
      useAuthStore.setState({
        user: userWithRole(role),
        isAuthenticated: true,
      });

      renderMenuQrRoute();

      expect(
        screen.queryByRole("heading", { name: "QR del menú" }),
      ).not.toBeInTheDocument();
      expect(await screen.findByText(PROMOTIONS_FALLBACK)).toBeInTheDocument();
    },
  );
});
