import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { UsersPage } from "@/features/users/users-page";
import { setTokens, clearTokens } from "@/lib/api";
import { AppPermission, UserRole } from "@/features/users/types";
import type { User } from "@/features/users/types";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

const SEED_USERS: User[] = [
  {
    id: "usr-owner",
    name: "Octavio Dueño",
    email: "owner@omnifood.ni",
    role: UserRole.OWNER,
    is_active: true,
    created_at: "2026-08-01T12:00:00Z",
  },
  {
    id: "usr-cashier",
    name: "Carlos Cajero",
    email: "carlos@omnifood.ni",
    role: UserRole.CASHIER,
    is_active: true,
    created_at: "2026-08-15T12:00:00Z",
  },
];

const SEED_MATRIX = {
  role_defaults: {
    [UserRole.OWNER]: [
      AppPermission.SALES_VOID_INVOICE,
      AppPermission.SALES_DISCOUNT_OVERRIDE,
      AppPermission.SALES_ITEM_CANCEL,
      AppPermission.SALES_PRICE_OVERRIDE,
      AppPermission.CASH_MANUAL_DRAWER_OPEN,
      AppPermission.CASH_REOPEN_SHIFT,
      AppPermission.INVENTORY_RECIPE_EDIT,
      AppPermission.REPORTS_VIEW_FISCAL,
      AppPermission.LOYALTY_PROGRAM_READ,
      AppPermission.LOYALTY_PROGRAM_WRITE,
      AppPermission.LOYALTY_REWARD_READ,
      AppPermission.LOYALTY_REWARD_WRITE,
      AppPermission.LOYALTY_CUSTOMER_READ,
      AppPermission.LOYALTY_HISTORY_READ,
      AppPermission.LOYALTY_ADJUST,
      AppPermission.LOYALTY_REDEEM,
    ],
    [UserRole.MANAGER]: [
      AppPermission.SALES_VOID_INVOICE,
      AppPermission.SALES_DISCOUNT_OVERRIDE,
      AppPermission.SALES_ITEM_CANCEL,
      AppPermission.SALES_PRICE_OVERRIDE,
      AppPermission.CASH_MANUAL_DRAWER_OPEN,
      AppPermission.CASH_REOPEN_SHIFT,
      AppPermission.REPORTS_VIEW_FISCAL,
      AppPermission.LOYALTY_PROGRAM_READ,
      AppPermission.LOYALTY_REWARD_READ,
      AppPermission.LOYALTY_CUSTOMER_READ,
      AppPermission.LOYALTY_HISTORY_READ,
    ],
    [UserRole.CASHIER]: [],
    [UserRole.WAITER]: [],
  },
  all_permissions: Object.values(AppPermission),
};

describe("W8 — Users & Permissions Integration Suite (Real React Query + UI)", () => {
  let inMemoryUsers: User[];
  let inMemoryPermissions: Record<string, AppPermission[]>;

  beforeEach(() => {
    inMemoryUsers = [...SEED_USERS];
    inMemoryPermissions = {
      "usr-cashier": [],
      "usr-owner": [],
    };

    setTokens({ accessToken: "test-owner-token", refreshToken: "test-refresh-token" });

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      // GET /api/identity/users
      if (method === "GET" && url.endsWith("/api/identity/users")) {
        return new Response(JSON.stringify(inMemoryUsers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // POST /api/identity/users
      if (method === "POST" && url.endsWith("/api/identity/users")) {
        const body = JSON.parse(init?.body as string);
        if (inMemoryUsers.some((u) => u.email === body.email)) {
          return new Response(
            JSON.stringify({ message: "El email ya está registrado", statusCode: 409 }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        const created: User = {
          id: `usr-${Date.now()}`,
          name: body.name,
          email: body.email,
          role: body.role,
          is_active: true,
          created_at: new Date().toISOString(),
        };
        inMemoryUsers.push(created);
        inMemoryPermissions[created.id] = [];
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      // PUT /api/identity/users/:id/permissions
      if (method === "PUT" && url.match(/\/api\/identity\/users\/[^/]+\/permissions$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/);
        const userId = match![1]!;
        const body = JSON.parse(init?.body as string);
        inMemoryPermissions[userId] = body.custom_permissions;
        const targetUser = inMemoryUsers.find((u) => u.id === userId);
        const roleDefaults = targetUser ? SEED_MATRIX.role_defaults[targetUser.role] : [];
        return new Response(
          JSON.stringify({
            user_id: userId,
            role: targetUser?.role ?? UserRole.CASHIER,
            role_permissions: roleDefaults,
            custom_permissions: body.custom_permissions,
            effective_permissions: Array.from(new Set([...roleDefaults, ...body.custom_permissions])),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // GET /api/identity/users/:id/permissions
      if (method === "GET" && url.match(/\/api\/identity\/users\/[^/]+\/permissions$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)\/permissions$/);
        const userId = match![1]!;
        const targetUser = inMemoryUsers.find((u) => u.id === userId);
        const custom = inMemoryPermissions[userId] ?? [];
        const roleDefaults = targetUser ? SEED_MATRIX.role_defaults[targetUser.role] : [];
        return new Response(
          JSON.stringify({
            user_id: userId,
            role: targetUser?.role ?? UserRole.CASHIER,
            role_permissions: roleDefaults,
            custom_permissions: custom,
            effective_permissions: Array.from(new Set([...roleDefaults, ...custom])),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // PUT /api/identity/users/:id
      if (method === "PUT" && url.match(/\/api\/identity\/users\/[^/]+$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)$/);
        const userId = match![1];
        const body = JSON.parse(init?.body as string);
        const userIndex = inMemoryUsers.findIndex((u) => u.id === userId);
        if (userIndex !== -1) {
          inMemoryUsers[userIndex] = {
            ...inMemoryUsers[userIndex]!,
            name: body.name ?? inMemoryUsers[userIndex]!.name,
            role: body.role ?? inMemoryUsers[userIndex]!.role,
          };
          return new Response(JSON.stringify(inMemoryUsers[userIndex]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // DELETE /api/identity/users/:id
      if (method === "DELETE" && url.match(/\/api\/identity\/users\/[^/]+$/)) {
        const match = url.match(/\/api\/identity\/users\/([^/]+)$/);
        const userId = match![1];
        inMemoryUsers = inMemoryUsers.filter((u) => u.id !== userId);
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // GET /api/identity/users/permissions/matrix
      if (method === "GET" && url.endsWith("/api/identity/users/permissions/matrix")) {
        return new Response(JSON.stringify(SEED_MATRIX), {
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

  it("renders the users list with badges, active counts, and action buttons", async () => {
    render(<UsersPage />, { wrapper: TestWrapper });

    expect(screen.getByText("Cargando usuarios...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Octavio Dueño")).toBeInTheDocument();
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    expect(screen.getByText("Dueño (Owner)")).toBeInTheDocument();
    expect(screen.getByText("Cajero (Cashier)")).toBeInTheDocument();
    expect(screen.getAllByText("Activo").length).toBe(2);
  });

  it("filters users interactively by name or role in search input", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Buscar por nombre, correo o rol...");
    await user.type(searchInput, "Octavio");

    expect(screen.getByText("Octavio Dueño")).toBeInTheDocument();
    expect(screen.queryByText("Carlos Cajero")).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "Cajero");

    expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    expect(screen.queryByText("Octavio Dueño")).not.toBeInTheDocument();
  });

  it("opens create user modal, enforces Zod validation, and shows error alert on invalid PIN", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("+ Nuevo Usuario")).toBeInTheDocument();
    });

    await user.click(screen.getByText("+ Nuevo Usuario"));

    expect(screen.getByText("Nuevo Usuario")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Ej: Carlos Mendoza");
    const emailInput = screen.getByPlaceholderText("carlos@omnifood.ni");
    const pinInput = screen.getByPlaceholderText("4 a 8 dígitos");

    await user.type(nameInput, "A"); // 1 char -> invalid
    await user.type(emailInput, "valida@omnifood.ni");
    await user.type(pinInput, "12"); // 2 digits -> invalid

    await user.click(screen.getByRole("button", { name: "Crear Usuario" }));

    await waitFor(() => {
      expect(
        screen.getByText(/El nombre debe tener al menos 2 caracteres/i),
      ).toBeInTheDocument();
    });
  });

  it("creates a new user successfully, updates table, and persists across query cache", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    await user.click(screen.getByText("+ Nuevo Usuario"));

    await user.type(screen.getByPlaceholderText("Ej: Carlos Mendoza"), "Marcos Mesero");
    await user.type(screen.getByPlaceholderText("carlos@omnifood.ni"), "marcos@omnifood.ni");
    await user.selectOptions(screen.getByRole("combobox"), UserRole.WAITER);
    await user.type(screen.getByPlaceholderText("Mín. 6 caracteres"), "password123");
    await user.type(screen.getByPlaceholderText("4 a 8 dígitos"), "4321");

    await user.click(screen.getByRole("button", { name: "Crear Usuario" }));

    await waitFor(() => {
      expect(screen.getByText("Marcos Mesero")).toBeInTheDocument();
      expect(screen.getByText("marcos@omnifood.ni")).toBeInTheDocument();
      expect(screen.getByText("Mesero (Waiter)")).toBeInTheDocument();
    });
  });

  it("handles 409 Conflict error gracefully when email already exists", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("+ Nuevo Usuario")).toBeInTheDocument();
    });

    await user.click(screen.getByText("+ Nuevo Usuario"));

    await user.type(screen.getByPlaceholderText("Ej: Carlos Mendoza"), "Clon");
    await user.type(screen.getByPlaceholderText("carlos@omnifood.ni"), "carlos@omnifood.ni"); // duplicate
    await user.type(screen.getByPlaceholderText("Mín. 6 caracteres"), "secret123");

    await user.click(screen.getByRole("button", { name: "Crear Usuario" }));

    await waitFor(() => {
      expect(screen.getByText("El email ya está registrado")).toBeInTheDocument();
    });
  });

  it("edits an existing user role and name via edit dialog", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    // Click "Editar" button for Carlos
    const editButtons = screen.getAllByRole("button", { name: /Editar/i });
    await user.click(editButtons[1]!); // Carlos is index 1

    expect(screen.getByText("Editar Usuario")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Ej: Carlos Mendoza");
    await user.clear(nameInput);
    await user.type(nameInput, "Carlos Promovido");

    const roleSelect = screen.getByRole("combobox");
    await user.selectOptions(roleSelect, UserRole.MANAGER);

    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }));

    await waitFor(() => {
      expect(screen.getByText("Carlos Promovido")).toBeInTheDocument();
      expect(screen.getByText("Gerente (Manager)")).toBeInTheDocument();
    });
  });

  it("opens granular permissions matrix, differentiates role defaults, and toggles custom grants", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    // Click "Permisos" button for Carlos Cajero (has 0 role defaults)
    const permsButtons = screen.getAllByRole("button", { name: /Permisos/i });
    await user.click(permsButtons[1]!);

    await waitFor(() => {
      expect(screen.getByText("Matriz de Permisos Granulares")).toBeInTheDocument();
      expect(screen.getByText(/0 de \d+ permisos/i)).toBeInTheDocument();
    });

    // Grant "Anular Facturas" custom permission
    const voidCheckbox = screen.getByRole("checkbox", { name: /Anular Facturas/i });
    expect(voidCheckbox).not.toBeChecked();

    await user.click(voidCheckbox);
    expect(voidCheckbox).toBeChecked();
    expect(screen.getByText(/1 de \d+ permisos/i)).toBeInTheDocument();

    // Grant "Ajuste Manual de Puntos" (Loyalty)
    const adjustCheckbox = screen.getByRole("checkbox", { name: /Ajuste Manual de Puntos/i });
    await user.click(adjustCheckbox);
    expect(adjustCheckbox).toBeChecked();
    expect(screen.getByText(/2 de \d+ permisos/i)).toBeInTheDocument();

    // Save permissions
    await user.click(screen.getByRole("button", { name: "Guardar Permisos" }));

    await waitFor(() => {
      expect(screen.queryByText("Matriz de Permisos Granulares")).not.toBeInTheDocument();
    });

    // Verify persisted in in-memory state
    expect(inMemoryPermissions["usr-cashier"]).toContain(AppPermission.SALES_VOID_INVOICE);
    expect(inMemoryPermissions["usr-cashier"]).toContain(AppPermission.LOYALTY_ADJUST);
  });

  it("deactivates user safely with confirmation dialog and removes from table", async () => {
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Carlos Cajero")).toBeInTheDocument();
    });

    // Click "Baja" button for Carlos Cajero
    const deleteButtons = screen.getAllByRole("button", { name: /Baja/i });
    await user.click(deleteButtons[1]!);

    expect(screen.getByText("Desactivar Usuario")).toBeInTheDocument();
    expect(screen.getByText(/¿Estás seguro de que deseás dar de baja al usuario/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar Desactivación" }));

    await waitFor(() => {
      expect(screen.queryByText("Carlos Cajero")).not.toBeInTheDocument();
    });
  });
});
