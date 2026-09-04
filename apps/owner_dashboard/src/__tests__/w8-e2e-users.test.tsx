import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "@/features/users/users-page";
import { setTokens, clearTokens } from "@/lib/api";
import { AppPermission, UserRole, DEFAULT_ROLE_PERMISSIONS } from "@/features/users/types";
import type { User } from "@/features/users/types";

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

describe("W8 E2E — Complete Users & Granular Permissions Lifecycle", () => {
  let dbUsers: User[];
  let dbPermissions: Record<string, AppPermission[]>;

  beforeEach(() => {
    dbUsers = [
      {
        id: "owner-1",
        name: "Admin Propietario",
        email: "owner@omnifood.ni",
        role: UserRole.OWNER,
        is_active: true,
        created_at: "2026-08-01T00:00:00Z",
      },
    ];
    dbPermissions = {
      "owner-1": [],
    };

    setTokens({ accessToken: "owner-jwt", refreshToken: "owner-refresh" });

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      // GET /api/identity/users
      if (method === "GET" && url.endsWith("/api/identity/users")) {
        return new Response(JSON.stringify(dbUsers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // POST /api/identity/users
      if (method === "POST" && url.endsWith("/api/identity/users")) {
        const body = JSON.parse(init?.body as string);
        const newUser: User = {
          id: `usr-${Date.now()}`,
          name: body.name,
          email: body.email,
          role: body.role,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        dbUsers.push(newUser);
        dbPermissions[newUser.id] = [];
        return new Response(JSON.stringify(newUser), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      // GET /api/identity/users/permissions/matrix
      if (method === "GET" && url.endsWith("/api/identity/users/permissions/matrix")) {
        return new Response(
          JSON.stringify({
            role_defaults: DEFAULT_ROLE_PERMISSIONS,
            all_permissions: Object.values(AppPermission),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // GET /api/identity/users/:id/permissions
      if (method === "GET" && url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/);
        const userId = match![1]!;
        const user = dbUsers.find((u) => u.id === userId);
        const custom = dbPermissions[userId] ?? [];
        const roleDefaults = user ? (DEFAULT_ROLE_PERMISSIONS[user.role] ?? []) : [];
        return new Response(
          JSON.stringify({
            user_id: userId,
            role: user?.role ?? UserRole.CASHIER,
            role_permissions: roleDefaults,
            custom_permissions: custom,
            effective_permissions: Array.from(new Set([...roleDefaults, ...custom])),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // PUT /api/identity/users/:id/permissions
      if (method === "PUT" && url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/);
        const userId = match![1]!;
        const body = JSON.parse(init?.body as string);
        dbPermissions[userId] = body.custom_permissions;
        const user = dbUsers.find((u) => u.id === userId);
        const roleDefaults = user ? (DEFAULT_ROLE_PERMISSIONS[user.role] ?? []) : [];
        return new Response(
          JSON.stringify({
            user_id: userId,
            role: user?.role ?? UserRole.CASHIER,
            role_permissions: roleDefaults,
            custom_permissions: body.custom_permissions,
            effective_permissions: Array.from(new Set([...roleDefaults, ...body.custom_permissions])),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // PUT /api/identity/users/:id
      if (method === "PUT" && url.match(/\/api\/identity\/users\/([^/]+)$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)$/);
        const userId = match![1];
        const body = JSON.parse(init?.body as string);
        const idx = dbUsers.findIndex((u) => u.id === userId);
        if (idx !== -1) {
          dbUsers[idx] = {
            ...dbUsers[idx]!,
            name: body.name ?? dbUsers[idx]!.name,
            role: body.role ?? dbUsers[idx]!.role,
          };
          return new Response(JSON.stringify(dbUsers[idx]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // DELETE /api/identity/users/:id
      if (method === "DELETE" && url.match(/\/api\/identity\/users\/([^/]+)$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)$/);
        const userId = match![1];
        dbUsers = dbUsers.filter((u) => u.id !== userId);
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it("executes complete lifecycle: Create User with PIN -> Configure Granular Permissions Matrix -> Promote Role -> Deactivate", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    // Step 1: Initial state shows owner
    await waitFor(() => {
      expect(screen.getByText("Admin Propietario")).toBeInTheDocument();
    });

    // Step 2: Create new Cashier user with supervisor PIN
    await user.click(screen.getByText("+ Nuevo Usuario"));
    expect(screen.getByText("Nuevo Usuario")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Ej: Carlos Mendoza"), "Sofía Cajera");
    await user.type(screen.getByPlaceholderText("carlos@omnifood.ni"), "sofia@omnifood.ni");
    await user.selectOptions(screen.getByRole("combobox"), UserRole.CASHIER);
    await user.type(screen.getByPlaceholderText("Mín. 6 caracteres"), "securepass123");
    await user.type(screen.getByPlaceholderText("4 a 8 dígitos"), "9876");

    await user.click(screen.getByRole("button", { name: "Crear Usuario" }));

    // Step 3: Verify Sofia is listed with Cashier role badge
    await waitFor(() => {
      expect(screen.getByText("Sofía Cajera")).toBeInTheDocument();
      expect(screen.getByText("Cajero (Cashier)")).toBeInTheDocument();
    });

    // Step 4: Open Permissions Matrix for Sofia
    const permButtons = screen.getAllByRole("button", { name: /Permisos/i });
    expect(permButtons.length).toBe(2);
    await user.click(permButtons[1]!); // Second user is Sofia

    await waitFor(() => {
      expect(screen.getByText("Matriz de Permisos Granulares")).toBeInTheDocument();
      expect(screen.getByText(/0 de 16 permisos/i)).toBeInTheDocument();
    });

    // Grant custom capabilities: "Anular Facturas" and "Apertura Manual de Gaveta"
    const voidCheckbox = screen.getByRole("checkbox", { name: /Anular Facturas/i });
    const drawerCheckbox = screen.getByRole("checkbox", { name: /Apertura Manual de Gaveta/i });

    await user.click(voidCheckbox);
    await user.click(drawerCheckbox);

    expect(screen.getByText(/2 de 16 permisos/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar Permisos" }));

    await waitFor(() => {
      expect(screen.queryByText("Matriz de Permisos Granulares")).not.toBeInTheDocument();
    });

    // Step 5: Edit Sofia to promote to MANAGER
    const editButtons = screen.getAllByRole("button", { name: /Editar/i });
    await user.click(editButtons[1]!);

    expect(screen.getByText("Editar Usuario")).toBeInTheDocument();
    const roleSelect = screen.getByRole("combobox");
    await user.selectOptions(roleSelect, UserRole.MANAGER);

    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }));

    await waitFor(() => {
      expect(screen.getByText("Gerente (Manager)")).toBeInTheDocument();
    });

    // Step 6: Verify permissions matrix reflects Manager role defaults
    const permButtonsAfter = screen.getAllByRole("button", { name: /Permisos/i });
    await user.click(permButtonsAfter[1]!);

    await waitFor(() => {
      expect(screen.getByText("Matriz de Permisos Granulares")).toBeInTheDocument();
    });

    // "Anular Facturas" is now inherited by MANAGER role -> should be disabled and tagged "Por rol"
    const voidCheckboxAfter = screen.getByRole("checkbox", { name: /Anular Facturas/i });
    expect(voidCheckboxAfter).toBeDisabled();
    expect(voidCheckboxAfter).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    // Step 7: Deactivate Sofia
    const deleteButtons = screen.getAllByRole("button", { name: /Baja/i });
    await user.click(deleteButtons[1]!);

    expect(screen.getByText("Desactivar Usuario")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar Desactivación" }));

    await waitFor(() => {
      expect(screen.queryByText("Sofía Cajera")).not.toBeInTheDocument();
    });

    // Only Admin remains
    expect(screen.getByText("Admin Propietario")).toBeInTheDocument();
  }, 20000);
});
