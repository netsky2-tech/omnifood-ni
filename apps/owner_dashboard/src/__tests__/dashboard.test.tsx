import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";

vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(() => ({
    data: {
      grossSales: 15000,
      invoiceCount: 42,
      ticketAverage: 357,
      totalTax: 1956,
      totalDiscounts: 500,
      paymentMethodsBreakdown: {
        cashNio: 8000,
        cashUsd: 200,
        cardNio: 4500,
        cardUsd: 300,
        other: 0,
        totalNio: 13000,
      },
      generatedAt: "2026-08-31T15:30:00Z",
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

describe("DashboardPage", () => {
  it("renders the dashboard heading", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders KPI cards", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
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

describe("DashboardPage — loading state", () => {
  beforeEach(() => {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useSalesDashboard>);
  });

  it("renders spinner while loading", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("does not render heading while loading", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — error state", () => {
  beforeEach(() => {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network failure"),
    } as ReturnType<typeof useSalesDashboard>);
  });

  it("renders error message", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText(/Error al cargar el dashboard/)).toBeInTheDocument();
  });

  it("suggests checking connection", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText(/Verifique su conexión/)).toBeInTheDocument();
  });

  it("does not render KPI cards on error", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Ventas Brutas")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — empty state", () => {
  beforeEach(() => {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: {
        grossSales: 0,
        invoiceCount: 0,
        ticketAverage: 0,
        totalTax: 0,
        totalDiscounts: 0,
        paymentMethodsBreakdown: {
          cashNio: 0, cashUsd: 0, cardNio: 0, cardUsd: 0, other: 0, totalNio: 0,
        },
        generatedAt: "2026-08-31T15:30:00Z",
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useSalesDashboard>);
  });

  it("renders KPI cards with zero values", () => {
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("Ventas Brutas").length).toBeGreaterThanOrEqual(1);
  });
});
