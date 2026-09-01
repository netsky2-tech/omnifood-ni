import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { SalesPage } from "@/features/sales/sales-page";
import { KpiCard } from "@/components/kpi-card";
import { FreshnessBadge } from "@/components/freshness-badge";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  useSalesDashboard,
  useHourlySales,
  useTopProducts,
  useCashierPerformance,
} from "@/features/sales/use-sales-reports";

vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(() => ({
    data: {
      grossSales: 15000.5,
      netTaxableSales: 13043.91,
      totalTax: 1956.59,
      totalDiscounts: 500,
      invoiceCount: 42,
      ticketAverage: 357.15,
      paymentMethodsBreakdown: {
        cashNio: 8000,
        cashUsd: 200,
        cardNio: 4500,
        cardUsd: 300,
        other: 0,
        totalNio: 13000,
      },
      startDate: "2026-08-31",
      endDate: "2026-08-31",
      generatedAt: "2026-08-31T15:30:00Z",
    },
    isLoading: false,
    error: null,
  })),
  useHourlySales: vi.fn(() => ({
    data: {
      date: "2026-08-31",
      totalSales: 15000,
      totalInvoices: 42,
      generatedAt: "2026-08-31T15:30:00Z",
      hourly: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        invoiceCount: i < 12 ? Math.floor(Math.random() * 5) : 0,
        totalSales: i < 12 ? Math.random() * 2000 : 0,
      })),
    },
    isLoading: false,
    error: null,
  })),
  useTopProducts: vi.fn(() => ({
    data: {
      generatedAt: "2026-08-31T15:30:00Z",
      products: [
        { productId: "p1", productName: "Hamburguesa Clásica", totalQuantity: 45, totalRevenue: 6750 },
        { productId: "p2", productName: "Papas Fritas", totalQuantity: 38, totalRevenue: 2660 },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useCashierPerformance: vi.fn(() => ({
    data: {
      generatedAt: "2026-08-31T15:30:00Z",
      cashiers: [
        { userId: "u1", cashierName: "María", invoiceCount: 25, totalSales: 8500, ticketAverage: 340 },
        { userId: "u2", cashierName: "Carlos", invoiceCount: 17, totalSales: 6500, ticketAverage: 382 },
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

describe("W2 — KpiCard", () => {
  it("renders label and value", () => {
    render(<KpiCard label="Ventas Brutas" value="C$ 15,000.50" />);
    expect(screen.getByText("Ventas Brutas")).toBeInTheDocument();
    expect(screen.getByText("C$ 15,000.50")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(<KpiCard label="Ticket" value="C$ 357" subtitle="42 facturas" />);
    expect(screen.getByText("42 facturas")).toBeInTheDocument();
  });
});

describe("W2 — FreshnessBadge", () => {
  it("renders time with CST", () => {
    render(<FreshnessBadge generatedAt="2026-08-31T15:30:00Z" />);
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument();
    expect(screen.getByText(/CST/)).toBeInTheDocument();
  });
});

describe("W2 — DateRangePicker", () => {
  it("renders date range", () => {
    render(
      <DateRangePicker
        value={{ startDate: "2026-08-01", endDate: "2026-08-31" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("2026-08-01")).toBeInTheDocument();
    expect(screen.getByText("2026-08-31")).toBeInTheDocument();
  });
});

describe("W2 — DashboardPage", () => {
  it("renders heading and KPI cards", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("Ventas Brutas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ticket Promedio").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Impuestos (IVA)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Descuentos").length).toBeGreaterThanOrEqual(1);
  });

  it("renders payment methods", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Métodos de Pago")).toBeInTheDocument();
    expect(screen.getByText("Efectivo NIO")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta NIO")).toBeInTheDocument();
  });

  it("renders freshness badge", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText(/Actualizado/)).toBeInTheDocument();
  });
});

describe("W2 — SalesPage", () => {
  it("renders heading and all tabs", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Ventas")).toBeInTheDocument();
    expect(screen.getByText("Resumen")).toBeInTheDocument();
    expect(screen.getByText("Ventas por Hora")).toBeInTheDocument();
    expect(screen.getByText("Top Productos")).toBeInTheDocument();
    expect(screen.getByText("Rendimiento Cajeros")).toBeInTheDocument();
  });

  it("defaults to summary tab", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Ventas Brutas")).toBeInTheDocument();
  });

  it("switches to hourly tab", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    const hourlyBtn = screen.getByText("Ventas por Hora");
    hourlyBtn.click();
    await waitFor(() => {
      expect(screen.getByText("Total Ventas")).toBeInTheDocument();
    });
  });

  it("switches to products tab", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Top Productos").click();
    await waitFor(() => {
      expect(screen.getByText("Hamburguesa Clásica")).toBeInTheDocument();
    });
  });

  it("switches to cashiers tab", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Rendimiento Cajeros").click();
    await waitFor(() => {
      expect(screen.getByText("María")).toBeInTheDocument();
      expect(screen.getByText("Carlos")).toBeInTheDocument();
    });
  });
});

describe("W2 — SalesPage loading states", () => {
  beforeEach(() => {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useSalesDashboard>);
    vi.mocked(useHourlySales).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useHourlySales>);
    vi.mocked(useTopProducts).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useTopProducts>);
    vi.mocked(useCashierPerformance).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useCashierPerformance>);
  });

  it("shows spinner on summary tab while loading", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows spinner on hourly tab while loading", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Ventas por Hora").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on products tab while loading", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Top Productos").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on cashiers tab while loading", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Rendimiento Cajeros").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });
});

describe("W2 — SalesPage error states", () => {
  beforeEach(() => {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("API down"),
    } as ReturnType<typeof useSalesDashboard>);
    vi.mocked(useHourlySales).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("API down"),
    } as ReturnType<typeof useHourlySales>);
    vi.mocked(useTopProducts).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("API down"),
    } as ReturnType<typeof useTopProducts>);
    vi.mocked(useCashierPerformance).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("API down"),
    } as ReturnType<typeof useCashierPerformance>);
  });

  it("renders empty state on summary tab when error", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Sin datos de resumen")).toBeInTheDocument();
  });

  it("renders empty state on hourly tab when error", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Ventas por Hora").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos horarios")).toBeInTheDocument();
    });
  });

  it("renders empty state on products tab when error", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Top Productos").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de productos")).toBeInTheDocument();
    });
  });

  it("renders empty state on cashiers tab when error", async () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    screen.getByText("Rendimiento Cajeros").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de cajeros")).toBeInTheDocument();
    });
  });

  it("does not crash and still renders page heading", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  it("does not render data tables on error", () => {
    render(<SalesPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Hamburguesa Clásica")).not.toBeInTheDocument();
    expect(screen.queryByText("María")).not.toBeInTheDocument();
  });
});
