import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "@/features/catalog/catalog-page";
import * as apiModule from "@/lib/api";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

const CREATED_VALUE = {
  id: "new-1",
  tenant_id: "t1",
  catalog_type: "UOM",
  code: "docena",
  name: "Docena",
  is_active: true,
  sort_order: 0,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
};

const CREATED_CATEGORY = {
  id: "cat-1",
  tenant_id: "t1",
  catalog_type: "INVENTORY_CATEGORY",
  code: "BEBIDAS",
  name: "Bebidas",
  is_active: true,
  sort_order: 0,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
};

function setupFetchMock() {
  const uomData: typeof CREATED_VALUE[] = [];
  const catData: typeof CREATED_CATEGORY[] = [];

  vi.mocked(globalThis.fetch).mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      // POST /catalogs/UOM — create
      if (method === "POST" && url.includes("/catalogs/UOM")) {
        const body = JSON.parse(init!.body as string);
        const created = { ...CREATED_VALUE, code: body.code, name: body.name };
        uomData.push(created);
        return jsonResponse(created);
      }

      // POST /catalogs/INVENTORY_CATEGORY — create
      if (method === "POST" && url.includes("/catalogs/INVENTORY_CATEGORY")) {
        const body = JSON.parse(init!.body as string);
        const created = { ...CREATED_CATEGORY, code: body.code, name: body.name };
        catData.push(created);
        return jsonResponse(created);
      }

      // DELETE /catalogs/UOM/:id — deactivate
      if (method === "DELETE" && url.match(/\/catalogs\/UOM\//)) {
        const id = url.split("/").pop();
        const idx = uomData.findIndex((v) => v.id === id);
        if (idx !== -1) uomData.splice(idx, 1);
        return jsonResponse({ id, deactivated: true });
      }

      // GET /catalogs/UOM — list
      if (method === "GET" && url.includes("/catalogs/UOM")) {
        return jsonResponse(uomData);
      }

      // GET /catalogs/INVENTORY_CATEGORY — list
      if (method === "GET" && url.includes("/catalogs/INVENTORY_CATEGORY")) {
        return jsonResponse(catData);
      }

      return jsonResponse([]);
    },
  );
}

describe("W5 — E2E: full catalog CRUD flow", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    apiModule.clearTokens();
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("create → verify in table → deactivate → verify removed", async () => {
    const user = userEvent.setup();
    setupFetchMock();

    render(<CatalogPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Sin valores en este catálogo")).toBeInTheDocument();
    });

    // Open create dialog
    await user.click(screen.getByText("+ Nuevo Valor"));
    expect(screen.getByText("Nuevo Valor")).toBeInTheDocument();

    // Fill form and submit
    await user.type(screen.getByPlaceholderText("Ej: kg, LACTEOS"), "docena");
    await user.type(screen.getByPlaceholderText("Ej: Kilogramo, Lácteos"), "Docena");
    await user.click(screen.getByText("Crear"));

    // Dialog closes, table shows new value
    await waitFor(() => {
      expect(screen.queryByText("Nuevo Valor")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Docena")).toBeInTheDocument();
    });

    // Deactivate
    const deactivateButtons = screen.getAllByText("Desactivar");
    await user.click(deactivateButtons[0]!);
    expect(screen.getByText("Desactivar Valor")).toBeInTheDocument();

    const allDeactivate = screen.getAllByText("Desactivar");
    await user.click(allDeactivate[allDeactivate.length - 1]!);

    await waitFor(() => {
      expect(screen.queryByText("Desactivar Valor")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText("Docena")).not.toBeInTheDocument();
    });
  });

  it("switch tab → create in different catalog type → verify", async () => {
    const user = userEvent.setup();
    setupFetchMock();

    render(<CatalogPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Sin valores en este catálogo")).toBeInTheDocument();
    });

    // Switch to INVENTORY_CATEGORY tab
    await user.click(screen.getByText("Categorías de Inventario"));

    await waitFor(() => {
      expect(screen.getByText("Sin valores en este catálogo")).toBeInTheDocument();
    });

    // Create
    await user.click(screen.getByText("+ Nuevo Valor"));

    await user.type(screen.getByPlaceholderText("Ej: kg, LACTEOS"), "BEBIDAS");
    await user.type(screen.getByPlaceholderText("Ej: Kilogramo, Lácteos"), "Bebidas");
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(screen.queryByText("Nuevo Valor")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Bebidas")).toBeInTheDocument();
    });

    // Switch back to UOM — should be empty
    await user.click(screen.getByText("Unidades de Medida"));

    await waitFor(() => {
      expect(screen.getByText("Sin valores en este catálogo")).toBeInTheDocument();
    });
  });

  it("handles API error during create gracefully", async () => {
    const user = userEvent.setup();
    setupFetchMock();

    render(<CatalogPage />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.getByText("Sin valores en este catálogo")).toBeInTheDocument();
    });

    await user.click(screen.getByText("+ Nuevo Valor"));
    await user.type(screen.getByPlaceholderText("Ej: kg, LACTEOS"), "dup");
    await user.type(screen.getByPlaceholderText("Ej: Kilogramo, Lácteos"), "Duplicate");

    // Override the fetch mock to return 409 for POST
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        message: 'Catalog value with code "dup" already exists for UOM',
      }),
    } as Response));

    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(
        screen.getByText('Catalog value with code "dup" already exists for UOM'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Nuevo Valor")).toBeInTheDocument();
  });
});
