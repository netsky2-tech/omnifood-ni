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
  formatNio,
  formatUsd,
  isZeroSeries,
} from "@/features/dashboard/chart-domain";
import {
  fetchDailySeries,
  fetchHourlyReport,
  normalizeHourlyReport,
} from "@/features/dashboard/dashboard-api";
import {
  fetchSalesDashboard,
  fetchTopProducts,
} from "@/features/sales/sales-api";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchDailySeries: vi.fn(),
  fetchHourlyReport: vi.fn(),
}));

vi.mock("@/features/sales/sales-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
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

/**
 * Normalized HourlyReportV2 (what fetchHourlyReport resolves to after wire
 * normalization — the mocked fetch must mimic that contract, not the raw wire).
 */
const hourlyPayload = (
  buckets: { hour: number; invoiceCount: number; netSalesNio: number; totalSales?: number }[],
  dayCount = 1,
) => ({
  date: dayCount > 1 ? RANGE.start : RANGE.end,
  dayCount,
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
  vi.mocked(fetchHourlyReport).mockResolvedValue(hourlyPayload([]) as never);
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
  it("fills the full 24h domain from V2 netSalesNio buckets and marks inactivity gaps", () => {
    const { bars, hasActivity } = buildHourlyBars([
      { hour: 7, invoiceCount: 3, netSalesNio: 900 },
      { hour: 12, invoiceCount: 5, netSalesNio: 1500 },
    ]);

    expect(bars).toHaveLength(24);
    expect(hasActivity).toBe(true);
    expect(bars[7]).toMatchObject({ hour: 7, sales: 900 });
    expect(bars[3]).toMatchObject({ hour: 3, sales: 0 });
    expect(bars[23]).toMatchObject({ hour: 23, sales: 0 });
  });

  it("never falls back to the deprecated tax-inclusive totalSales bucket field", () => {
    // Batch 5c V2 semantics: a legacy-only payload must fail closed to zero
    // sales, not silently display the post-tax total.
    const { bars, hasActivity } = buildHourlyBars([
      { hour: 9, invoiceCount: 3, totalSales: 900 } as never,
    ]);
    expect(hasActivity).toBe(false);
    expect(bars[9]).toMatchObject({ hour: 9, sales: 0 });
  });

  it("derives a zero-padded business-hours caption from first to last active hour", () => {
    const { firstActiveHour, lastActiveHour } = buildHourlyBars([
      { hour: 7, invoiceCount: 3, netSalesNio: 900 },
      { hour: 20, invoiceCount: 5, netSalesNio: 1500 },
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
    { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080 },
    { productId: "p2", productName: "Latte", totalQuantity: 186, netRevenueNio: 8060 },
    { productId: "p3", productName: "Croissant", totalQuantity: 98, netRevenueNio: 4320 },
  ];

  it("computes share percent over the period's Net Sales denominator and keeps backend order", () => {
    // Period Net Sales (44920) is larger than the listed rows' sum (22460):
    // shares are shares OF THE PERIOD, not of the listed Top-N rows.
    const { rows } = buildTopProductRows(products, 5, 44920);

    expect(rows[0]).toMatchObject({ name: "Cappuccino", units: 214, revenue: 10080 });
    expect(rows[0]?.sharePercent).toBeCloseTo((10080 / 44920) * 100, 1);
    expect(rows[1]?.sharePercent).toBeCloseTo((8060 / 44920) * 100, 1);
    expect(rows[2]?.name).toBe("Croissant");
    expect(rows[2]?.sharePercent).toBeCloseTo((4320 / 44920) * 100, 1);
    // Per-row rounding to 1 decimal keeps the sum at (or just under) the
    // true period share of the listed rows — never inflated toward 100%.
    const shareSum = rows.reduce((sum, r) => sum + (r.sharePercent ?? 0), 0);
    expect(shareSum).toBeLessThanOrEqual(100);
    expect(shareSum).toBeLessThan((22460 / 44920) * 100 + 0.15);
  });

  it("yields ~50% — not 100% — for a partial Top-N whose listed rows sum to half the period", () => {
    const partial = products.slice(0, 2); // listed net: 10080 + 8060 = 18140
    const { rows } = buildTopProductRows(partial, 2, 36280);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.sharePercent).toBeCloseTo((10080 / 36280) * 100, 1);
    expect(rows[1]?.sharePercent).toBeCloseTo((8060 / 36280) * 100, 1);
    for (const row of rows) {
      expect(row.sharePercent).not.toBe(100);
    }
  });

  it("fails closed to a null share when the period denominator is missing, 0, negative or non-finite", () => {
    for (const denominator of [undefined, 0, -44920, Number.NaN, "not-a-number"]) {
      const { rows } = buildTopProductRows(products, 5, denominator as never);
      expect(rows.every((r) => r.sharePercent === null)).toBe(true);
    }
  });

  it("limits rows to the compact-card budget and preserves a null share on a zero base", () => {
    const { rows } = buildTopProductRows(products, 2, 44920);
    expect(rows).toHaveLength(2);

    const zeroBase = buildTopProductRows([
      { productId: "p1", productName: "X", totalQuantity: 0, netRevenueNio: 0 },
    ]);
    expect(zeroBase.rows[0]?.sharePercent).toBeNull();
  });

  it("reads V2 netRevenueNio and never the deprecated tax-inclusive totalRevenue", () => {
    const { rows } = buildTopProductRows([
      { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 8000, totalRevenue: 10080 },
    ]);
    expect(rows[0]?.revenue).toBe(8000);
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

describe("normalizeHourlyReport — Batch 5c hourly wire (pure)", () => {
  it("normalizes buckets to V2 netSalesNio and carries meta.dayCount", () => {
    const report = normalizeHourlyReport({
      date: "2026-09-18",
      totalSales: 999,
      meta: { dayCount: 6 },
      generatedAt: "2026-09-23T21:54:00Z",
      hourly: [
        { hour: 8, invoiceCount: 2, netSalesNio: "450.5", totalSales: 600 },
        { hour: "9", invoiceCount: 1, netSalesNio: 100 },
        { hour: 25, invoiceCount: 1, netSalesNio: 0 },
      ],
    });
    expect(report.date).toBe("2026-09-18");
    expect(report.dayCount).toBe(6);
    expect(report.hourly[0]).toEqual({ hour: 8, invoiceCount: 2, netSalesNio: 450.5 });
    expect(report.hourly[1]).toEqual({ hour: 9, invoiceCount: 1, netSalesNio: 100 });
    expect(report.hourly).toHaveLength(3);
  });

  it("fails closed: missing meta defaults to dayCount 1 and garbage buckets to empty", () => {
    const report = normalizeHourlyReport({ hourly: "nope" });
    expect(report.dayCount).toBe(1);
    expect(report.hourly).toEqual([]);
    expect(report.date).toBe("");
  });
});

describe("HourlySales — states (PRD §15/§23)", () => {
  it("renders 'sin actividad' for a zero range and never a meaningless chart", async () => {
    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/sin actividad/i)).toBeInTheDocument();
  });

  it("queries a multi-day range with startDate/endDate and shows the averaged caption", async () => {
    vi.mocked(fetchHourlyReport).mockResolvedValue(
      hourlyPayload(
        [
          { hour: 7, invoiceCount: 3, netSalesNio: 900 },
          { hour: 12, invoiceCount: 5, netSalesNio: 1500 },
          { hour: 20, invoiceCount: 2, netSalesNio: 600 },
        ],
        6,
      ) as never,
    );

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-caption")).toBeInTheDocument();
    });
    expect(fetchHourlyReport).toHaveBeenCalledWith(
      { startDate: RANGE.start, endDate: RANGE.end },
      expect.anything(),
    );
    expect(screen.getByTestId("hourly-caption").textContent).toContain("Promedio por hora en 6 días");
    expect(screen.getByTestId("hourly-caption").textContent).toContain("07:00");
    expect(screen.getByTestId("hourly-caption").textContent).toContain("20:00");
  });

  it("queries a single day with date and reports the day caption", async () => {
    vi.mocked(fetchHourlyReport).mockResolvedValue(
      hourlyPayload([
        { hour: 7, invoiceCount: 3, netSalesNio: 900 },
        { hour: 20, invoiceCount: 2, netSalesNio: 600 },
      ]) as never,
    );

    renderWithProviders(
      <PerformanceBand range={{ start: "2026-09-23", end: "2026-09-23" }} today="2026-09-23" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("hourly-caption")).toBeInTheDocument();
    });
    expect(fetchHourlyReport).toHaveBeenCalledWith({ date: "2026-09-23" }, expect.anything());
    expect(screen.getByTestId("hourly-caption").textContent).toContain("Día: 2026-09-23");
    expect(screen.getByTestId("hourly-caption").textContent).toContain("07:00");
    expect(screen.getByTestId("hourly-caption").textContent).toContain("20:00");
  });

  it("isolates an hourly failure from siblings", async () => {
    vi.mocked(fetchHourlyReport).mockRejectedValue(new Error("hourly down"));

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Top productos")).toBeInTheDocument();
  });
});

describe("TopProducts — states (PRD §16/§23)", () => {
  it("renders product name, units, net revenue and share from the reconciled endpoint", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      periodNetSalesNio: 18140,
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080, totalRevenue: 12000 },
        { productId: "p2", productName: "Latte", totalQuantity: 186, netRevenueNio: 8060, totalRevenue: 9500 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    });
    expect(screen.getByText(/214\s*u/i)).toBeInTheDocument();
    // Net revenue (post-discount, pre-tax), not the tax-inclusive total.
    expect(screen.getByText(/C\$10,080\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(/\d+(?:\.\d+)?%/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders shares as an em-dash when the period denominator is 0 (empty period fail-closed)", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      periodNetSalesNio: 0,
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 0 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    });
    const rows = screen.getByTestId("top-products-rows");
    expect(rows.textContent).toContain("—");
    expect(rows.textContent).not.toMatch(/\d+(?:\.\d+)?%/);
  });

  it("proves truncation: 2 of 5 products listed never claim 100% of the business", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      // Listed rows sum to 18140 = half the period Net Sales: every share
      // must sit near 50% in aggregate, never 100%.
      periodNetSalesNio: 36280,
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080 },
        { productId: "p2", productName: "Latte", totalQuantity: 186, netRevenueNio: 8060 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("top-products-rows")).toBeInTheDocument();
    });
    const rows = screen.getByTestId("top-products-rows").textContent ?? "";
    expect(rows).toContain("27.8%");
    expect(rows).toContain("22.2%");
    expect(rows).not.toContain("100");
  });

  it("drops the tax-inclusive disclaimer and states the period Net Sales basis on the card", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      periodNetSalesNio: 10080,
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("top-products-note")).toBeInTheDocument();
    });
    const note = screen.getByTestId("top-products-note").textContent ?? "";
    expect(note.toLowerCase()).not.toContain("no equivale");
    expect(note).toContain("Ventas Netas del período");
    expect(note).not.toContain("productos listados");
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
    vi.mocked(fetchHourlyReport).mockResolvedValue(
      hourlyPayload([{ hour: 12, invoiceCount: 5, netSalesNio: 1500 }], 6) as never,
    );
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080 },
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

describe("chart-domain — money formatting (review round 2, WU9)", () => {
  it("prints córdobas with the shared es-NI C$ prefix used across the dashboard", () => {
    expect(formatNio(48520.5)).toBe("C$48,520.50");
    expect(formatNio(10080)).toBe("C$10,080.00");
  });

  it("never renders a signed zero: 0, -0 and a round-to-zero negative are unsigned", () => {
    expect(formatNio(0)).toBe("C$0.00");
    expect(formatNio(-0)).toBe("C$0.00");
    expect(formatNio(-0.001)).toBe("C$0.00");
  });

  it("keeps the sign of a genuinely small negative — real money is not flattened", () => {
    expect(formatNio(-0.01)).toBe("-C$0.01");
  });

  it("applies the same signed-zero rule to original-currency USD amounts", () => {
    // es-NI separates the USD code from the amount with a no-break space.
    expect(formatUsd(0)).toBe("USD\u00A00.00");
    expect(formatUsd(-0)).toBe("USD\u00A00.00");
    expect(formatUsd(-0.001)).toBe("USD\u00A00.00");
    expect(formatUsd(-0.01)).toBe("-USD\u00A00.01");
  });
});

describe("Top Products share — denominator is named and never clamped (finding S1)", () => {
  it("a share above 100% renders as computed, because clamping would fabricate a share", () => {
    // Denominator is Net Sales net of refunds: product A C$1,000, product B
    // C$800 minus a C$900 refund => period Net Sales C$900 => A is 111.1%.
    // The honest rendering is the true quotient, not a capped 100%.
    const { rows } = buildTopProductRows(
      [
        { productId: 'p1', productName: 'Café', totalQuantity: 100, netRevenueNio: 1000 },
        { productId: 'p2', productName: 'Sándwich', totalQuantity: 40, netRevenueNio: -100 },
      ],
      undefined,
      900,
    );
    expect(rows[0]?.sharePercent).toBeCloseTo(111.1, 1);
    expect(rows[0]!.sharePercent!).toBeGreaterThan(100);
  });


});
