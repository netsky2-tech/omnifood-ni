import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";

// Sync-freshness wiring (PRD §20): the page now consumes the real
// useSyncFreshness hook; mock it so these page-level tests never hit the API
// client. The badge's own state matrix lives in dashboard-v2-freshness.spec.tsx.
vi.mock("@/features/dashboard/use-sync-freshness", () => ({
  useSyncFreshness: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

// Dashboard V2 Batch 4 (#544): the legacy KPI grid was replaced by the
// regime-aware strip. The mock below keeps these page-level tests focused on
// their own concerns (Resumen de Ventas, loading/error states); the strip's
// own behavior matrix lives in dashboard-v2-strip.spec.tsx.
vi.mock("@/features/dashboard/use-dashboard-kpis", () => ({
  useDashboardKpis: vi.fn(() => ({
    period: {
      currentStart: "2026-08-31",
      currentEnd: "2026-08-31",
      previousStart: "2026-08-24",
      previousEnd: "2026-08-24",
    },
    snapshot: {
      netSalesNio: 48520.5,
      completedTicketCount: 171,
      averageTicketNetNio: 283.74,
      totalTaxNio: 6341.25,
      totalDiscountsNio: 1564.95,
      margin: { amount: 29780.5, percent: 61.4 },
      deltas: {
        netSales: 12.4,
        tickets: 8.2,
        averageTicket: 3.8,
        marginPp: 1.9,
        totalTax: 9.1,
      },
    },
    isSalesPending: false,
    isSalesFailed: false,
    fiscal: { regime: "CUOTA_FIJA" },
    isFiscalFailed: false,
    isFiscalPending: false,
    isCogsFailed: false,
  })),
}));

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

  it("renders the V2 executive KPI strip (Cuota Fija: no IVA card)", () => {
    // #544 / FR-FISCAL-03: the legacy permanent "Impuestos (IVA)" card at C$0
    // for cuota-fija tenants was replaced by the regime-aware strip. "Ventas
    // Brutas" survives via the legacy "Resumen de Ventas" widget (arch spec
    // §7.3 retains legacy fields for existing consumers).
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.getAllByText("Ventas Brutas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.queryByText("IVA generado")).not.toBeInTheDocument();
  });

  it("renders Resumen de Ventas without the legacy Métodos de Pago card", () => {
    // Batch 5c: the legacy "Métodos de Pago" card was removed — the
    // PaymentMixChart in the performance band is the single payment surface.
    render(<DashboardPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Métodos de Pago")).not.toBeInTheDocument();
    expect(screen.queryByText("Efectivo NIO")).not.toBeInTheDocument();
    expect(screen.getByText("Resumen de Ventas")).toBeInTheDocument();
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
