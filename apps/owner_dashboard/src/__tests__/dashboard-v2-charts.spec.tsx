/**
 * Dashboard V2 Batch 5b — performance-band charts.
 *
 * Authorities:
 * - PRD §14 (FR-CHART-01..04), §15 (FR-HOURLY-01..03), §16 (FR-PRODUCT-01),
 *   §17 (FR-PAY-01..04), §23 (states), §24 (drill-down), §25 (visual)
 * - Frozen daily-series contract (Batch 5b task): GET
 *   /sales/reports/dashboard/daily-series?startDate&endDate
 *
 * Adapter suites run as pure functions. Component suites mock the fetch layer
 * (never a live backend — the daily-series endpoint is being built
 * concurrently) and assert only DOM-exposed legend/caption/row values, never
 * recharts internals.
 */
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceBand } from "@/features/dashboard/performance-band";
import {
  buildHourlyBars,
  buildPaymentMixRows,
  buildTopProductRows,
  buildTrendRows,
  isZeroSeries,
} from "@/features/dashboard/chart-domain";
import { fetchDailySeries } from "@/features/dashboard/dashboard-api";
import {
  fetchHourlySales,
  fetchSalesDashboard,
  fetchTopProducts,
} from "@/features/sales/sales-api";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchDailySeries: vi.fn(),
}));

vi.mock("@/features/sales/sales-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchHourlySales: vi.fn(),
  fetchSalesDashboard: vi.fn(),
  fetchTopProducts: vi.fn(),
}));

vi.mock("@/features/dashboard/use-dashboard-kpis", () => ({
  useDashboardKpis: vi.fn(() => ({
    period: {
      currentStart: "2026-09-23",
      currentEnd: "2026-09-23",
      previousStart: "2026-09-16",
      previousEnd: "2026-09-16",
    },
    snapshot: {
      netSalesNio: 48520.5,
      completedTicketCount: 171,
      averageTicketNetNio: 283.74,
      totalTaxNio: 6341.25,
      totalDiscountsNio: 1564.95,
      margin: { amount: 29780.5, percent: 61.4 },
      deltas: { netSales: 0, tickets: 0, averageTicket: 0, marginPp: 0, totalTax: 0 },
    },
    isSalesPending: false,
    isSalesFailed: false,
    fiscal: { regime: "CUOTA_FIJA" },
    isFiscalFailed: false,
    isFiscalPending: false,
    isCogsFailed: false,
  })),
}));

// Page-level mock (same style as dashboard.test.tsx): the legacy report hook
// resolves synchronously so the page test exercises the Suspense boundary,
// not the legacy full-page spinner.
vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(() => ({
    data: {
      grossSales: 56425.7,
      netTaxableSales: 48520.5,
      totalTax: 6341.25,
      totalDiscounts: 1564.95,
      invoiceCount: 175,
      ticketAverage: 322.43,
      paymentMethodsBreakdown: {
        cashNio: 23290, cashUsd: 300, cardNio: 18923, cardUsd: 150, other: 6307, totalNio: 48520,
      },
      generatedAt: "2026-09-23T21:54:00Z",
    },
    isLoading: false,
    error: null,
  })),
}));

// recharts ResponsiveContainer needs a ResizeObserver; jsdom has none.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

const RANGE = { start: "2026-09-18", end: "2026-09-23" };
const PREVIOUS = { start: "2026-09-12", end: "2026-09-17" };

const day = (date: string, netSalesNio: number, completedTicketCount = 4) => ({
  date,
  netSalesNio,
  completedTicketCount,
  averageTicketNetNio: completedTicketCount > 0 ? netSalesNio / completedTicketCount : null,
});

const dailySeriesPayload = (days: unknown[]) => ({
  days,
  reportingPeriod: {
    timezone: "America/Managua",
    localStartDate: RANGE.start,
    localEndDate: RANGE.end,
  },
  generatedAt: "2026-09-23T21:54:00Z",
});

const hourlyPayload = (buckets: { hour: number; invoiceCount: number; totalSales: number }[]) => ({
  date: RANGE.end,
  totalSales: buckets.reduce((s, b) => s + b.totalSales, 0),
  totalInvoices: buckets.reduce((s, b) => s + b.invoiceCount, 0),
  generatedAt: "2026-09-23T21:54:00Z",
  hourly: buckets,
});

const dashboardReportPayload = () => ({
  grossSales: 56425.7,
  netTaxableSales: 48520.5,
  totalTax: 6341.25,
  totalDiscounts: 1564.95,
  invoiceCount: 175,
  ticketAverage: 322.43,
  paymentMethodsBreakdown: {
    cashNio: 23290,
    cashUsd: 300,
    cardNio: 18923,
    cardUsd: 150,
    other: 6307,
    totalNio: 48520,
  },
  generatedAt: "2026-09-23T21:54:00Z",
});

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDailySeries).mockResolvedValue(dailySeriesPayload([]) as never);
  vi.mocked(fetchHourlySales).mockResolvedValue(hourlyPayload([]) as never);
  vi.mocked(fetchTopProducts).mockResolvedValue({
    startDate: RANGE.start,
    endDate: RANGE.end,
    generatedAt: "2026-09-23T21:54:00Z",
    products: [],
  } as never);
  vi.mocked(fetchSalesDashboard).mockResolvedValue(dashboardReportPayload() as never);
});

describe("chart-domain — trend adapters (pure)", () => {
  it("merges current and previous series by range position with date bucket labels", () => {
    const current = [
      day("2026-09-18", 1000),
      day("2026-09-19", 1200),
      day("2026-09-20", 900),
    ];
    const previous = [
      day("2026-09-12", 800),
      day("2026-09-13", 1100),
      day("2026-09-14", 950),
    ];

    const rows = buildTrendRows(current, previous);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: "2026-09-18", current: 1000, previous: 800 });
    // es-NI short bucket label: day number + short month (locale-stable parts).
    expect(rows[0]?.label).toContain("18");
    expect(rows[0]?.label.toLowerCase()).toContain("sep");
  });

  it("null-fills a missing/short comparison series instead of fabricating zeros", () => {
    const current = [day("2026-09-18", 1000), day("2026-09-19", 1200)];

    const withoutPrevious = buildTrendRows(current, null);
    expect(withoutPrevious[0]?.previous).toBeNull();

    const shortPrevious = buildTrendRows(current, [day("2026-09-12", 800)]);
    expect(shortPrevious[0]?.previous).toBe(800);
    expect(shortPrevious[1]?.previous).toBeNull();
  });

  it("detects an all-zero series as empty (FR-CHART-04) and treats null/empty as empty", () => {
    expect(isZeroSeries([day("2026-09-18", 0, 0), day("2026-09-19", 0, 0)])).toBe(true);
    expect(isZeroSeries([day("2026-09-18", 0, 0), day("2026-09-19", 500, 2)])).toBe(false);
    expect(isZeroSeries(null)).toBe(true);
    expect(isZeroSeries([])).toBe(true);
  });
});

describe("chart-domain — hourly adapter (pure)", () => {
  it("fills the full 24h domain and marks inactivity gaps", () => {
    const { bars, hasActivity } = buildHourlyBars([
      { hour: 7, invoiceCount: 3, totalSales: 900 },
      { hour: 12, invoiceCount: 5, totalSales: 1500 },
    ]);

    expect(bars).toHaveLength(24);
    expect(hasActivity).toBe(true);
    expect(bars[7]).toMatchObject({ hour: 7, sales: 900 });
    expect(bars[3]).toMatchObject({ hour: 3, sales: 0 });
    expect(bars[23]).toMatchObject({ hour: 23, sales: 0 });
  });

  it("derives a zero-padded business-hours caption from first to last active hour", () => {
    const { firstActiveHour, lastActiveHour } = buildHourlyBars([
      { hour: 7, invoiceCount: 3, totalSales: 900 },
      { hour: 20, invoiceCount: 5, totalSales: 1500 },
    ]);
    expect(firstActiveHour).toBe(7);
    expect(lastActiveHour).toBe(20);
  });

  it("reports no activity for garbage/empty wire data", () => {
    expect(buildHourlyBars([])).toMatchObject({ hasActivity: false, firstActiveHour: null });
    expect(buildHourlyBars(null)).toMatchObject({ hasActivity: false, lastActiveHour: null });
  });
});

describe("chart-domain — top-products adapter (pure)", () => {
  const products = [
    { productId: "p1", productName: "Cappuccino", totalQuantity: 214, totalRevenue: 10080 },
    { productId: "p2", productName: "Latte", totalQuantity: 186, totalRevenue: 8060 },
    { productId: "p3", productName: "Croissant", totalQuantity: 98, totalRevenue: 4320 },
  ];

  it("computes share percent of the listed revenue sum and keeps backend order", () => {
    const { rows } = buildTopProductRows(products);

    expect(rows[0]).toMatchObject({ name: "Cappuccino", units: 214, revenue: 10080 });
    expect(rows[0]?.sharePercent).toBeCloseTo((10080 / 22460) * 100, 1);
    expect(rows[2]?.name).toBe("Croissant");
  });

  it("limits rows to the compact-card budget and preserves a null share on a zero base", () => {
    const { rows } = buildTopProductRows(products, 2);
    expect(rows).toHaveLength(2);

    const zeroBase = buildTopProductRows([
      { productId: "p1", productName: "X", totalQuantity: 0, totalRevenue: 0 },
    ]);
    expect(zeroBase.rows[0]?.sharePercent).toBeNull();
  });

  it("carries an honest tax-inclusive revenue-basis note (PRD FR-PRODUCT-01 gap)", () => {
    const { revenueBasisNote } = buildTopProductRows(products);
    expect(revenueBasisNote.toLowerCase()).toContain("iva");
  });
});

describe("chart-domain — payment-mix adapter (pure)", () => {
  const breakdown = {
    cashNio: 23290,
    cashUsd: 300,
    cardNio: 18923,
    cardUsd: 150,
    other: 6307,
    totalNio: 48520,
  };

  it("renders NIO rows with percent of totalNio and flags USD rows as original currency", () => {
    const { rows, totalNio } = buildPaymentMixRows(breakdown);

    expect(totalNio).toBe(48520);
    const cashNio = rows.find((r) => r.key === "cashNio");
    expect(cashNio?.currency).toBe("NIO");
    expect(cashNio?.percent).toBeCloseTo((23290 / 48520) * 100, 1);
    const cashUsd = rows.find((r) => r.key === "cashUsd");
    expect(cashUsd?.currency).toBe("USD");
    expect(cashUsd?.amount).toBe(300);
  });

  it("returns null percents on a zero base (never 0% or NaN) and survives null wire", () => {
    const zero = buildPaymentMixRows({ cashNio: 0, cashUsd: 0, cardNio: 0, cardUsd: 0, other: 0, totalNio: 0 });
    expect(zero.rows.every((r) => r.percent === null)).toBe(true);
    expect(buildPaymentMixRows(null).rows).toHaveLength(0);
  });
});

describe("SalesTrend — states (PRD §14/§23)", () => {
  function mockSeries(current: unknown[], previous: unknown[] | null) {
    vi.mocked(fetchDailySeries).mockImplementation(((start: string) => {
      if (start === RANGE.start) return Promise.resolve(dailySeriesPayload(current));
      if (previous && start === PREVIOUS.start) return Promise.resolve(dailySeriesPayload(previous));
      return Promise.reject(new Error(`unexpected range ${start}`));
    }) as typeof fetchDailySeries);
  }

  it("renders text legend labels and comparison caption, hiding entirely on a single day", async () => {
    mockSeries([day("2026-09-18", 1000)], [day("2026-09-12", 800)]);

    const { rerender } = renderWithProviders(
      <PerformanceBand range={RANGE} today="2026-09-23" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("trend-legend")).toBeInTheDocument();
    });
    expect(screen.getByText(/periodo actual/i)).toBeInTheDocument();
    expect(screen.getByText(/periodo anterior/i)).toBeInTheDocument();

    // Single-day range: the trend is hourly's job — no trend card at all.
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
          <PerformanceBand range={{ start: "2026-09-23", end: "2026-09-23" }} today="2026-09-23" />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("trend-legend")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Ventas por hora")).toBeInTheDocument();
  });

  it("shows an explicit no-sales state instead of a flat zero line (FR-CHART-04)", async () => {
    mockSeries([day("2026-09-18", 0, 0), day("2026-09-19", 0, 0)], null);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/no hay ventas en este per/i)).toBeInTheDocument();
  });

  it("isolates a trend fetch failure from sibling widgets (PRD FR-STATE-04)", async () => {
    vi.mocked(fetchDailySeries).mockRejectedValue(new Error("daily-series down"));

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Top productos")).toBeInTheDocument();
    expect(screen.getByText("Mix de pagos")).toBeInTheDocument();
  });

  it("keeps the current series when only the comparison series fails", async () => {
    vi.mocked(fetchDailySeries).mockImplementation(((start: string) => {
      if (start === RANGE.start) return Promise.resolve(dailySeriesPayload([day("2026-09-18", 4000)]));
      return Promise.reject(new Error("comparison down"));
    }) as typeof fetchDailySeries);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-legend")).toBeInTheDocument();
    });
    expect(screen.getByText(/no se pudo cargar la comparación/i)).toBeInTheDocument();
    expect(screen.getByText(/periodo actual/i)).toBeInTheDocument();
  });
});

describe("HourlySales — states (PRD §15/§23)", () => {
  it("renders 'sin actividad' for a zero day and never a meaningless chart", async () => {
    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/sin actividad/i)).toBeInTheDocument();
  });

  it("renders the business-hours caption and the reported day for data days", async () => {
    vi.mocked(fetchHourlySales).mockResolvedValue(
      hourlyPayload([
        { hour: 7, invoiceCount: 3, totalSales: 900 },
        { hour: 12, invoiceCount: 5, totalSales: 1500 },
        { hour: 20, invoiceCount: 2, totalSales: 600 },
      ]) as never,
    );

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-caption")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hourly-caption").textContent).toContain("07:00");
    expect(screen.getByTestId("hourly-caption").textContent).toContain("20:00");
    expect(screen.getByTestId("hourly-caption").textContent).toContain(RANGE.end);
  });

  it("isolates an hourly failure from siblings", async () => {
    vi.mocked(fetchHourlySales).mockRejectedValue(new Error("hourly down"));

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Top productos")).toBeInTheDocument();
  });
});

describe("TopProducts — states (PRD §16/§23)", () => {
  it("renders product name, units, revenue and share from the existing endpoint", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, totalRevenue: 10080 },
        { productId: "p2", productName: "Latte", totalQuantity: 186, totalRevenue: 8060 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    });
    expect(screen.getByText(/214\s*u/i)).toBeInTheDocument();
    expect(screen.getByText(/C\$10,080\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(/\d+(?:\.\d+)?%/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the honest tax-inclusive revenue-basis note on the card", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, totalRevenue: 10080 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("top-products-note")).toBeInTheDocument();
    });
    expect(screen.getByTestId("top-products-note").textContent.toLowerCase()).toContain("iva");
  });

  it("renders an explicit empty state and isolates endpoint failures", async () => {
    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("top-products-empty")).toBeInTheDocument();
    });

    vi.mocked(fetchTopProducts).mockRejectedValue(new Error("top-products down"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={client}>
          <PerformanceBand range={RANGE} today="2026-09-23" />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("top-products-error")).toBeInTheDocument();
    });
  });
});

describe("PaymentMix — states (PRD §17/§23)", () => {
  it("renders method labels with amounts and direct percent labels (color-never-alone)", async () => {
    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByText("Efectivo (C$)")).toBeInTheDocument();
    });
    expect(screen.getByText("Tarjeta (C$)")).toBeInTheDocument();
    expect(screen.getByText("Efectivo (US$)")).toBeInTheDocument();
    expect(screen.getByText("C$23,290.00")).toBeInTheDocument();
    expect(screen.getAllByText(/\d+(?:\.\d+)?%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/consolidaci/i)).toBeInTheDocument();
  });

  it("renders an explicit empty state on a zero total (no zero placeholders)", async () => {
    vi.mocked(fetchSalesDashboard).mockResolvedValue({
      ...dashboardReportPayload(),
      paymentMethodsBreakdown: { cashNio: 0, cashUsd: 0, cardNio: 0, cardUsd: 0, other: 0, totalNio: 0 },
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("payment-mix-empty")).toBeInTheDocument();
    });
  });

  it("isolates a payment-mix failure from siblings", async () => {
    vi.mocked(fetchSalesDashboard).mockRejectedValue(new Error("dashboard down"));

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("payment-mix-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Top productos")).toBeInTheDocument();
  });
});

describe("PerformanceBand — composition and drill-down (PRD §24)", () => {
  it("exposes navigation-only drill-down links to Sales for every insight card", async () => {
    vi.mocked(fetchHourlySales).mockResolvedValue(
      hourlyPayload([{ hour: 12, invoiceCount: 5, totalSales: 1500 }]) as never,
    );
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, totalRevenue: 10080 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /ver/i }).length).toBeGreaterThanOrEqual(4);
    });
    for (const link of screen.getAllByRole("link", { name: /ver/i })) {
      expect(link.getAttribute("href")).toBe("/sales");
    }
  });
});

describe("PerformanceBand — lazy loading (page integration)", () => {
  it("keeps the KPI strip and page visible while the chart chunk is still loading", async () => {
    const { DashboardPage } = await import("@/features/dashboard/dashboard-page");

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={client}>
          <DashboardPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // Synchronously: the strip must never wait on chart code.
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();

    // Then the lazy band resolves and mounts.
    await waitFor(() => {
      expect(screen.getByText("Top productos")).toBeInTheDocument();
    });
  });
});
