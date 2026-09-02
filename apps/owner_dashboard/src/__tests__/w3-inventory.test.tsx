import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPage } from "@/features/inventory/inventory-page";
import {
  useValuation,
  useCogs,
  useKardex,
  useAlerts,
} from "@/features/inventory/use-inventory-reports";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  useValuation: vi.fn(() => ({
    data: {
      totalValuationNio: 245000.75,
      totalItemsCount: 120,
      itemsWithStockCount: 98,
      itemsLowStockCount: 5,
      itemsNegativeStockCount: 1,
      generatedAt: "2026-08-31T15:30:00Z",
      items: [
        {
          id: "i1",
          name: "Carne Molida",
          consumptionUom: "kg",
          stock: 45,
          averageCostNio: 220,
          totalValuationNio: 9900,
          isLowStock: false,
          isNegativeStock: false,
          isPerishable: true,
        },
        {
          id: "i2",
          name: "Pan Brioche",
          consumptionUom: "pz",
          stock: 3,
          averageCostNio: 8,
          totalValuationNio: 24,
          stockMin: 10,
          isLowStock: true,
          isNegativeStock: false,
          isPerishable: false,
        },
        {
          id: "i3",
          name: "Papas Fritas",
          consumptionUom: "kg",
          stock: -2,
          averageCostNio: 45,
          totalValuationNio: -90,
          isLowStock: false,
          isNegativeStock: true,
          isPerishable: false,
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useCogs: vi.fn(() => ({
    data: {
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
      totalCogsNio: 82000,
      salesCogsNio: 78000,
      shrinkageCogsNio: 4000,
      generatedAt: "2026-08-31T15:30:00Z",
      items: [
        {
          insumoId: "i1",
          insumoName: "Carne Molida",
          consumptionUom: "kg",
          salesQuantity: 120,
          salesCostNio: 26400,
          shrinkageQuantity: 5,
          shrinkageCostNio: 1100,
          totalQuantity: 125,
          totalCostNio: 27500,
          costPercentage: 33.5,
        },
        {
          insumoId: "i2",
          insumoName: "Pan Brioche",
          consumptionUom: "pz",
          salesQuantity: 200,
          salesCostNio: 1600,
          shrinkageQuantity: 10,
          shrinkageCostNio: 80,
          totalQuantity: 210,
          totalCostNio: 1680,
          costPercentage: 2.0,
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useKardex: vi.fn(() => ({
    data: {
      totalCount: 2,
      filters: {},
      generatedAt: "2026-08-31T15:30:00Z",
      movements: [
        {
          id: "m1",
          insumoId: "i1",
          insumoName: "Carne Molida",
          consumptionUom: "kg",
          type: "ENTRY",
          quantity: 50,
          stockBefore: 0,
          stockAfter: 50,
          unitCostNio: 220,
          createdAt: "2026-08-15T10:00:00Z",
        },
        {
          id: "m2",
          insumoId: "i1",
          insumoName: "Carne Molida",
          consumptionUom: "kg",
          type: "EXIT",
          quantity: 5,
          stockBefore: 50,
          stockAfter: 45,
          createdAt: "2026-08-15T14:00:00Z",
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useAlerts: vi.fn(() => ({
    data: {
      totalAlertsCount: 2,
      criticalCount: 1,
      warningCount: 1,
      negativeCount: 0,
      generatedAt: "2026-08-31T15:30:00Z",
      alerts: [
        {
          insumoId: "i2",
          insumoName: "Pan Brioche",
          consumptionUom: "pz",
          stock: 3,
          minStock: 10,
          severity: "CRITICAL",
          message: "Stock por debajo del mínimo",
          suggestedReorderQuantity: 50,
          isPerishable: false,
        },
        {
          insumoId: "i4",
          insumoName: "Leche Entera",
          consumptionUom: "L",
          stock: 8,
          minStock: 15,
          severity: "WARNING",
          message: "Stock cerca del mínimo",
          suggestedReorderQuantity: 20,
          isPerishable: true,
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("W3 — InventoryPage", () => {
  it("renders heading and all tabs", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Inventario")).toBeInTheDocument();
    expect(screen.getAllByText("Valoración").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("COGS / Margen")).toBeInTheDocument();
    expect(screen.getByText("Kardex")).toBeInTheDocument();
    expect(screen.getByText("Alertas")).toBeInTheDocument();
  });

  it("defaults to valuation tab with summary stats", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Valoración Total")).toBeInTheDocument();
    expect(screen.getByText("Total Ítems")).toBeInTheDocument();
    expect(screen.getByText("Con Stock")).toBeInTheDocument();
    expect(screen.getByText("Stock Bajo")).toBeInTheDocument();
  });

  it("shows negative stock warning when items have negative stock", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText(/1 ítem\(s\) con stock negativo/)).toBeInTheDocument();
  });

  it("renders valuation table with items", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Carne Molida")).toBeInTheDocument();
    expect(screen.getByText("Pan Brioche")).toBeInTheDocument();
    expect(screen.getByText("Papas Fritas")).toBeInTheDocument();
  });

  it("switches to COGS tab", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("COGS / Margen").click();
    await waitFor(() => {
      expect(screen.getByText("COGS Total")).toBeInTheDocument();
      expect(screen.getByText("COGS Ventas")).toBeInTheDocument();
      expect(screen.getByText("COGS Mermas")).toBeInTheDocument();
    });
  });

  it("renders COGS table with items", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("COGS / Margen").click();
    await waitFor(() => {
      expect(screen.getByText("Carne Molida")).toBeInTheDocument();
      expect(screen.getByText("33.5%")).toBeInTheDocument();
    });
  });

  it("switches to kardex tab with movement type filters", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Kardex").click();
    await waitFor(() => {
      expect(screen.getByText("Todos")).toBeInTheDocument();
      expect(screen.getAllByText("Entrada").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Salida").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Ajuste")).toBeInTheDocument();
      expect(screen.getByText("2 movimiento(s)")).toBeInTheDocument();
    });
  });

  it("renders kardex movements", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Kardex").click();
    await waitFor(() => {
      expect(screen.getByText("Carne Molida")).toBeInTheDocument();
    });
  });

  it("switches to alerts tab with severity badges", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Alertas").click();
    await waitFor(() => {
      expect(screen.getByText("Total Alertas")).toBeInTheDocument();
      expect(screen.getByText("Críticas")).toBeInTheDocument();
      expect(screen.getByText("Advertencias")).toBeInTheDocument();
      expect(screen.getByText("Stock Negativo")).toBeInTheDocument();
      expect(screen.getByText("Pan Brioche")).toBeInTheDocument();
      expect(screen.getByText("Leche Entera")).toBeInTheDocument();
    });
  });

  it("renders alert severity badges", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Alertas").click();
    await waitFor(() => {
      expect(screen.getByText("CRITICAL")).toBeInTheDocument();
      expect(screen.getByText("WARNING")).toBeInTheDocument();
    });
  });
});

describe("W3 — InventoryPage loading states", () => {
  beforeEach(() => {
    vi.mocked(useValuation).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useValuation>);
    vi.mocked(useCogs).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useCogs>);
    vi.mocked(useKardex).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useKardex>);
    vi.mocked(useAlerts).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useAlerts>);
  });

  it("shows spinner on valuation tab while loading", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows spinner on COGS tab while loading", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("COGS / Margen").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on kardex tab while loading", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Kardex").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on alerts tab while loading", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Alertas").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });
});

describe("W3 — InventoryPage error states", () => {
  beforeEach(() => {
    vi.mocked(useValuation).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DB connection lost"),
    } as ReturnType<typeof useValuation>);
    vi.mocked(useCogs).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DB connection lost"),
    } as ReturnType<typeof useCogs>);
    vi.mocked(useKardex).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DB connection lost"),
    } as ReturnType<typeof useKardex>);
    vi.mocked(useAlerts).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DB connection lost"),
    } as ReturnType<typeof useAlerts>);
  });

  it("renders empty state on valuation tab when error", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Sin datos de valoración")).toBeInTheDocument();
  });

  it("renders empty state on COGS tab when error", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("COGS / Margen").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de COGS")).toBeInTheDocument();
    });
  });

  it("renders empty state on kardex tab when error", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Kardex").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de kardex")).toBeInTheDocument();
    });
  });

  it("renders empty state on alerts tab when error", async () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    screen.getByText("Alertas").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de alertas")).toBeInTheDocument();
    });
  });

  it("does not crash and still renders page heading", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Inventario")).toBeInTheDocument();
  });

  it("does not render data tables on error", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Carne Molida")).not.toBeInTheDocument();
    expect(screen.queryByText("Pan Brioche")).not.toBeInTheDocument();
  });
});
