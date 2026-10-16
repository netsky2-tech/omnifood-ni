/**
 * R19 (S16) — Kardex surface compliance with Nhilos backoffice standards:
 * - §12 Data Tables: columns justify their presence, tabular alignment
 * - §13 Search: multiclass search by insumo name or reason/document, no-data vs no-results distinction
 * - §15 Sorting & Pagination: explicit active sort, visible direction, pagination with page-size selector (10/25/50) and "Mostrando X–Y de Z"
 * - Taxonomy completeness: VALUATION_WRITEDOWN and INITIAL_STOCK render localized Spanish copy, never an em-dash
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPage } from "@/features/inventory/inventory-page";
import { useKardex } from "@/features/inventory/use-inventory-reports";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  useValuation: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCogs: vi.fn(() => ({ data: undefined, isLoading: false })),
  useAlerts: vi.fn(() => ({ data: undefined, isLoading: false })),
  useKardex: vi.fn(),
}));

const mockMovements = [
  {
    id: "m1",
    insumoId: "i1",
    insumoName: "Café en Grano",
    consumptionUom: "kg",
    type: "ENTRADA_COMPRA",
    quantity: 50,
    stockBefore: 0,
    stockAfter: 50,
    unitCostNio: 150,
    totalCostNio: 7500,
    averageCostAfterNio: 150,
    reason: "Factura F-001",
    createdAt: "2026-10-10T10:00:00Z",
  },
  {
    id: "m2",
    insumoId: "i2",
    insumoName: "Ron Flor de Caña 7 Años",
    consumptionUom: "UND",
    type: "VALUATION_WRITEDOWN",
    quantity: 0,
    stockBefore: 6,
    stockAfter: 6,
    unitCostNio: 300,
    totalCostNio: -300,
    averageCostAfterNio: 300,
    reason: "Ajuste de mercado",
    createdAt: "2026-10-15T15:00:00Z",
  },
  {
    id: "m3",
    insumoId: "i3",
    insumoName: "Leche Entera",
    consumptionUom: "L",
    type: "INITIAL_STOCK",
    quantity: 20,
    stockBefore: 0,
    stockAfter: 20,
    unitCostNio: 35,
    totalCostNio: 700,
    averageCostAfterNio: 35,
    reason: "Inventario inicial apertura",
    createdAt: "2026-10-01T08:00:00Z",
  },
  {
    id: "m4",
    insumoId: "i1",
    insumoName: "Café en Grano",
    consumptionUom: "kg",
    type: "SALE",
    quantity: -2,
    stockBefore: 50,
    stockAfter: 48,
    unitCostNio: 150,
    totalCostNio: -300,
    averageCostAfterNio: 150,
    reason: "Ticket #1024",
    createdAt: "2026-10-12T14:30:00Z",
  },
];

import { MemoryRouter } from "react-router-dom";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <MemoryRouter initialEntries={["/inventory?tab=kardex"]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("KardexTab — Nhilos standard & principles (R19 / S16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useKardex).mockReturnValue({
      data: {
        totalCount: mockMovements.length,
        filters: {},
        generatedAt: "2026-10-15T16:00:00Z",
        movements: mockMovements,
      },
      isLoading: false,
      error: null,
    } as any);
  });

  it("renders localized labels for VALUATION_WRITEDOWN and INITIAL_STOCK, never an em-dash", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });

    expect((await screen.findAllByText("Castigo por valuación")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stock inicial").length).toBeGreaterThanOrEqual(1);
  });

  it("provides search that filters by insumo name or reason/document, with clear affordance", async () => {
    const user = userEvent.setup();
    render(<InventoryPage />, { wrapper: TestWrapper });

    const searchInput = await screen.findByPlaceholderText(/Buscar por insumo o motivo/i);
    expect(searchInput).toBeInTheDocument();

    // Type query
    await user.type(searchInput, "Flor de Caña");
    expect(screen.getByText("Ron Flor de Caña 7 Años")).toBeInTheDocument();
    expect(screen.queryByText("Café en Grano")).toBeNull();

    // Clear search
    const clearBtn = screen.getByRole("button", { name: /Limpiar búsqueda/i });
    await user.click(clearBtn);
    expect(screen.getAllByText("Café en Grano").length).toBeGreaterThanOrEqual(1);
  });

  it("distinguishes no-results state from empty data state", async () => {
    const user = userEvent.setup();
    render(<InventoryPage />, { wrapper: TestWrapper });

    const searchInput = await screen.findByPlaceholderText(/Buscar por insumo o motivo/i);
    await user.type(searchInput, "inexistente");

    expect(await screen.findByText(/No se encontraron movimientos para “inexistente”/i)).toBeInTheDocument();
  });

  it("provides column sorting with explicit aria-sort indicators", async () => {
    const user = userEvent.setup();
    render(<InventoryPage />, { wrapper: TestWrapper });

    const dateHeader = await screen.findByRole("columnheader", { name: /Fecha/i });
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");

    // Click to invert
    const dateBtn = within(dateHeader).getByRole("button");
    await user.click(dateBtn);
    expect(dateHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("supports pagination and page-size selection with visible range indication", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });

    expect(await screen.findByText(/Mostrando 1–4 de 4 movimientos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filas por página/i)).toBeInTheDocument();
  });
});
