import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { InventoryPage } from "@/features/inventory/inventory-page";
import { SalesPage } from "@/features/sales/sales-page";
import { FiscalPage } from "@/features/fiscal/fiscal-page";
import { TopProductsChart } from "@/features/dashboard/top-products-chart";
import { PaymentMixChart } from "@/features/dashboard/payment-mix-chart";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  useValuation: vi.fn(() => ({ data: null, isLoading: false })),
  useCogs: vi.fn(() => ({ data: null, isLoading: false })),
  useKardex: vi.fn(() => ({ data: null, isLoading: false })),
  useAlerts: vi.fn(() => ({
    data: {
      criticalCount: 2,
      warningCount: 1,
      negativeCount: 0,
      totalAlertsCount: 3,
      alerts: [
        {
          insumoId: "i1",
          insumoName: "Carne Molida",
          stock: 2,
          minStock: 10,
          severity: "CRITICAL",
          message: "Stock por debajo del mínimo crítico",
          suggestedReorderQuantity: 20,
        },
        {
          insumoId: "i2",
          insumoName: "Papas",
          stock: 5,
          minStock: 8,
          severity: "WARNING",
          message: "Stock acercándose al mínimo",
          suggestedReorderQuantity: 10,
        },
      ],
      generatedAt: "2026-09-26T12:00:00Z",
    },
    isLoading: false,
  })),
}));

vi.mock("@/features/dashboard/use-dashboard-charts", () => ({
  useTopProductsReport: vi.fn(() => ({
    data: {
      products: [
        { productId: "p1", productName: "Espresso", totalQuantity: 25, netRevenueNio: 1250 },
      ],
      periodNetSalesNio: 1250,
    },
    isPending: false,
    isError: false,
  })),
  usePaymentMixReport: vi.fn(() => ({
    data: {
      paymentMethodsBreakdown: {
        totalNio: 1000,
        cashNio: 500,
        cashUsd: 0,
        cardNio: 500,
        cardUsd: 0,
        other: 0,
      },
    },
    isPending: false,
    isError: false,
  })),
}));

vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(() => ({
    data: {
      grossSales: 1000,
      invoiceCount: 10,
      ticketAverage: 100,
      paymentMethodsBreakdown: {
        cashNio: 600,
        cashUsd: 0,
        cardNio: 400,
        cardUsd: 0,
        other: 0,
      },
      generatedAt: "2026-09-26T12:00:00Z",
    },
    isLoading: false,
  })),
  useHourlySales: vi.fn(() => ({ data: null, isLoading: false })),
  useTopProducts: vi.fn(() => ({
    data: {
      products: [
        { productId: "p1", productName: "Espresso", totalQuantity: 25, totalRevenue: 1250 },
        { productId: "p2", productName: "Cappuccino", totalQuantity: 10, totalRevenue: 800 },
      ],
      generatedAt: "2026-09-26T12:00:00Z",
    },
    isLoading: false,
  })),
  useCashierPerformance: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock("@/features/fiscal/use-fiscal-reports", () => ({
  useMonthlyFiscalSummary: vi.fn(() => ({ data: null, isLoading: false })),
  useVoidedInvoices: vi.fn(() => ({
    data: {
      totalVoidedCount: 3,
      totalVoidedAmount: 450,
      invoices: [],
      generatedAt: "2026-09-26T12:00:00Z",
    },
    isLoading: false,
  })),
  useSequenceAudit: vi.fn(() => ({
    data: {
      hasGaps: true,
      missingSequences: ["001-001-01-0000005"],
      duplicateSequences: [],
      series: [],
      generatedAt: "2026-09-26T12:00:00Z",
    },
    isLoading: false,
  })),
  useSalesBookExport: vi.fn(() => ({ data: null, isLoading: false })),
  useZReportsExport: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock("@/features/auth/permissions", () => ({
  useCanViewInventoryCost: vi.fn(() => true),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("Destination Pages Contextual Navigation Reception", () => {
  it("InventoryPage activates alerts tab and filters by critical severity when requested", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/inventory?tab=alerts&status=CRITICAL&source=dashboard"]}>
          <InventoryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Alerts tab is active
    expect(screen.getByText("Insumo")).toBeInTheDocument();
    expect(screen.getByText(/Mostrando alertas con severidad:/i)).toBeInTheDocument();
    expect(screen.getByText("Carne Molida")).toBeInTheDocument();
    // Papas has severity WARNING and should be filtered out
    expect(screen.queryByText("Papas")).not.toBeInTheDocument();
  });

  it("SalesPage activates products tab and highlights/filters selected product", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/sales?tab=products&product=Espresso&source=dashboard"]}>
          <SalesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Mostrando producto:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Espresso").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cappuccino")).not.toBeInTheDocument();
  });

  it("FiscalPage activates voided invoices tab from dashboard URL context", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/fiscal?tab=voided&startDate=2026-09-01&endDate=2026-09-26&source=dashboard"]}>
          <FiscalPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Monto Total Anulado")).toBeInTheDocument();
    expect(screen.getByText("Total Anuladas")).toBeInTheDocument();
  });

  it("FiscalPage activates sequence audit tab from dashboard URL context", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/fiscal?tab=sequence&startDate=2026-09-01&endDate=2026-09-26&source=dashboard"]}>
          <FiscalPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/secuencia\(s\) faltante\(s\)/i)).toBeInTheDocument();
  });

  it("TopProductsChart links product rows to /sales with product and period context (CN-03)", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopProductsChart start="2026-09-01" end="2026-09-26" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const espressoLink = await screen.findByRole("link", { name: "Espresso" });
    expect(espressoLink).toBeInTheDocument();
    const href = espressoLink.getAttribute("href");
    expect(href).toContain("/sales?source=dashboard&sourceWidget=top-products");
    expect(href).toContain("startDate=2026-09-01");
    expect(href).toContain("endDate=2026-09-26");
    expect(href).toContain("entityType=product");
    expect(href).toContain("product=Espresso");
  });

  it("PaymentMixChart links payment rows to /sales with payment method and period context (CN-04)", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PaymentMixChart start="2026-09-01" end="2026-09-26" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const cashLink = await screen.findByRole("link", { name: /efectivo \(c\$\)/i });
    expect(cashLink).toBeInTheDocument();
    const href = cashLink.getAttribute("href");
    expect(href).toContain("/sales?source=dashboard&sourceWidget=payment-mix");
    expect(href).toContain("startDate=2026-09-01");
    expect(href).toContain("endDate=2026-09-26");
    expect(href).toContain("entityType=payment");
    expect(href).toContain("paymentMethod=cashNio");
  });
});
