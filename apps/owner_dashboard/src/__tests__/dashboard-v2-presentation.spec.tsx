/**
 * Dashboard V2 presentation — review round 2 (WU9).
 *
 * Owner findings covered here:
 * - the money axes of the chart band must carry the C$ unit using the SAME
 *   shared es-NI formatter the rest of the dashboard uses (chart-domain's
 *   formatNio); unit/count axes (hours, product units) stay unitless;
 * - the page-level "Periodo:" footer is redundant with the date-range control
 *   and must be gone, while the selected range stays visible on the picker
 *   trigger — "which period am I looking at" must never lose its on-screen
 *   attribution (temporal consistency, review round 2).
 *
 * recharts ResponsiveContainer is stubbed to a fixed size so the axis tick
 * <text> nodes actually render under jsdom; assertions target visible tick
 * text only, never recharts internals.
 */
import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceBand } from "@/features/dashboard/performance-band";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { fetchDailySeries, fetchHourlyReport } from "@/features/dashboard/dashboard-api";
import { fetchSalesDashboard, fetchTopProducts } from "@/features/sales/sales-api";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const ResponsiveContainerStub = ({
    children,
    width = 640,
    height = 240,
  }: {
    children?: ReactNode;
    width?: number;
    height?: number;
  }) => cloneElement(children as ReactElement<Record<string, unknown>>, { width, height });
  return { ...actual, ResponsiveContainer: ResponsiveContainerStub };
});

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

// Page-level mock (same style as dashboard-v2-charts.spec.tsx). The payload
// carries startDate/endDate because the round-1 page rendered its "Periodo:"
// footer from those fields — the WU9 test proves the footer is gone.
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
      startDate: "2026-09-18",
      endDate: "2026-09-23",
      generatedAt: "2026-09-23T21:54:00Z",
    },
    isLoading: false,
    error: null,
  })),
}));

const RANGE = { start: "2026-09-18", end: "2026-09-23" };

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

const hourlyPayload = (buckets: { hour: number; invoiceCount: number; netSalesNio: number }[]) => ({
  date: RANGE.end,
  dayCount: 1,
  generatedAt: "2026-09-23T21:54:00Z",
  hourly: buckets,
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

/** Visible axis tick text inside a chart card (svg <text> only). */
function svgTexts(card: HTMLElement): string[] {
  return Array.from(card.querySelectorAll("svg text")).map((t) => t.textContent ?? "");
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
  vi.mocked(fetchSalesDashboard).mockResolvedValue({
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
  } as never);
});

describe("WU9 — money axes carry the C$ unit (owner finding 1)", () => {
  it("trend y-axis ticks print córdobas with the shared formatter, zero included and unsigned", async () => {
    vi.mocked(fetchDailySeries).mockResolvedValue(
      dailySeriesPayload([day("2026-09-18", 10080), day("2026-09-19", 4852)]) as never,
    );

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-legend")).toBeInTheDocument();
    });
    const texts = svgTexts(screen.getByTestId("trend-card"));
    expect(texts.some((t) => t.startsWith("C$"))).toBe(true);
    expect(texts).toContain("C$0.00");
    expect(texts).not.toContain("-C$0.00");
  });

  it("hourly money ticks carry C$ while the hour axis stays unitless", async () => {
    vi.mocked(fetchHourlyReport).mockResolvedValue(
      hourlyPayload([{ hour: 7, invoiceCount: 3, netSalesNio: 900 }]) as never,
    );

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByTestId("hourly-caption")).toBeInTheDocument();
    });
    const texts = svgTexts(screen.getByTestId("hourly-card"));
    expect(texts.some((t) => t.startsWith("C$"))).toBe(true);
    const hourTicks = texts.filter((t) => /^\d{2}:00$/.test(t));
    expect(hourTicks.length).toBeGreaterThan(0);
    expect(hourTicks.every((t) => !t.includes("C$"))).toBe(true);
  });

  it("top-products revenue axis carries C$ and the units cell stays a bare count", async () => {
    vi.mocked(fetchTopProducts).mockResolvedValue({
      startDate: RANGE.start,
      endDate: RANGE.end,
      generatedAt: "2026-09-23T21:54:00Z",
      periodNetSalesNio: 18140,
      products: [
        { productId: "p1", productName: "Cappuccino", totalQuantity: 214, netRevenueNio: 10080 },
      ],
    } as never);

    renderWithProviders(<PerformanceBand range={RANGE} today="2026-09-23" />);

    await waitFor(() => {
      expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    });
    // Units are a count, not money: no currency prefix may leak onto them.
    expect(within(screen.getByTestId("top-products-rows")).getByText(/214\s*u/)).toBeInTheDocument();
    const texts = svgTexts(screen.getByTestId("top-products-card"));
    expect(texts.some((t) => t.startsWith("C$"))).toBe(true);
  });
});

describe("WU9 — period attribution (owner finding 3)", () => {
  it("drops the redundant 'Periodo:' footer and keeps the range visible on the date control", async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Periodo:/)).not.toBeInTheDocument();
    // The selected range remains attributed on screen: the picker trigger
    // always renders "startDate — endDate".
    const trigger = screen.getByRole("button", { name: /seleccionar rango de fechas/i });
    expect(trigger.textContent).toMatch(/\d{4}-\d{2}-\d{2}—\d{4}-\d{2}-\d{2}/);
  });
});
