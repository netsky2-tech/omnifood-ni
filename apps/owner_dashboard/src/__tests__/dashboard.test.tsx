import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

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
});
