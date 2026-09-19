import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/app/layout/sidebar";
import { useAuthStore } from "@/features/auth/auth-store";
import type { User, UserRole } from "@/types";

/**
 * Navigation integration coverage for the menu QR feature: the sidebar must
 * expose a `QR del menú` entry inside the `Gestión` section, pointing at
 * `/menu-qr` with the shared Lucide QrCode icon, and must filter it out for
 * roles without route access (same `canAccessRoute` contract as the route).
 */

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

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("menu QR sidebar navigation", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      isAuthenticated: false,
      hydrated: true,
    });
  });

  it("shows a `QR del menú` entry in the Gestión section for OWNER", () => {
    useAuthStore.setState({ user: userWithRole("OWNER") });

    renderSidebar();

    // The sidebar renders twice (mobile drawer + desktop aside), so inspect
    // every `Gestión` section group and require each QR entry to be correct.
    const gestionGroups = screen
      .getAllByText("Gestión")
      .map((heading) => heading.parentElement!);
    expect(gestionGroups.length).toBeGreaterThan(0);

    const qrLinks = gestionGroups.flatMap((group) =>
      Array.from(group.querySelectorAll<HTMLAnchorElement>("a")).filter(
        (link) => link.getAttribute("aria-label") === "QR del menú",
      ),
    );
    expect(qrLinks.length).toBeGreaterThan(0);

    for (const link of qrLinks) {
      expect(link).toHaveAttribute("href", "/menu-qr");
      // The entry must use the shared Lucide QrCode icon like the other items.
      const icon = link.querySelector("svg.lucide-qr-code");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it.each(["MANAGER", "CASHIER"] as UserRole[])(
    "applies the route permission contract for %s",
    (role) => {
      useAuthStore.setState({ user: userWithRole(role) });

      renderSidebar();

      const qrLinks = screen
        .queryAllByRole("link", { name: "QR del menú" })
        .filter((link) => link.getAttribute("href") === "/menu-qr");
      if (role === "MANAGER") {
        expect(qrLinks.length).toBeGreaterThan(0);
      } else {
        expect(qrLinks).toHaveLength(0);
      }
    },
  );
});
