/**
 * Dashboard V2 Batch 7 Slice 3 — backend tip aggregation & dashboard tip
 * summary (PRD §21, §22.1, AC-14, AC-15).
 *
 * Authorities:
 * - PRD §21.2 (tip KPI set), §21.3 (tips never merge into Net Sales),
 *   §21.4 (inapplicable profile: omit, never zero placeholders)
 * - arch spec §18.7 (tip reporting coverage metadata), AD-10 (legacy NULL
 *   rows are never backfilled to zero)
 *
 * Mock style follows the existing suite: fetch layers are mocked while the
 * real normalization/delta/hook logic runs under a real QueryClient.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { TipsSummaryCard } from "@/features/dashboard/tips-summary";
import {
  normalizeDashboardReport,
  normalizeTipsSummary,
} from "@/features/dashboard/dashboard-api";
import {
  buildKpiSnapshot,
  isTipsSummaryApplicable,
  tipParticipationPercent,
} from "@/features/dashboard/kpi-deltas";
import { useDashboardKpis } from "@/features/dashboard/use-dashboard-kpis";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchDashboardReport: vi.fn(),
  fetchFiscalSetup: vi.fn(),
}));

vi.mock("@/features/inventory/inventory-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchCogs: vi.fn(),
}));

vi.mock("@/features/dashboard/use-dashboard-kpis", () => ({
  useDashboardKpis: vi.fn(),
}));

vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const TIPS_SUMMARY = {
  totalTipsNio: 130,
  tippedTicketCount: 2,
  averageTipNio: 65,
  tipRate: 8.13,
  tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
};

const LEGACY_NULL_SUMMARY = {
  totalTipsNio: null,
  tippedTicketCount: 0,
  averageTipNio: null,
  tipRate: null,
  tipCoverage: { recordedInvoicesCount: 0, totalInvoicesCount: 4 },
};

describe("normalizeTipsSummary (wire string-number normalization)", () => {
  it("coerces numeric strings and preserves nullable rates/averages", () => {
    const summary = normalizeTipsSummary({
      totalTipsNio: "130.00",
      tippedTicketCount: "2",
      averageTipNio: null,
      tipRate: "8.13",
      tipCoverage: { recordedInvoicesCount: "3", totalInvoicesCount: "4" },
    });
    expect(summary).toEqual({
      totalTipsNio: 130,
      tippedTicketCount: 2,
      averageTipNio: null,
      tipRate: 8.13,
      tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
    });
  });

  it("fails closed to null on absent or malformed payloads (widget hidden, never fabricated)", () => {
    expect(normalizeTipsSummary(undefined)).toBeNull();
    expect(normalizeTipsSummary(null)).toBeNull();
    expect(normalizeTipsSummary({})).toBeNull();
    expect(
      normalizeTipsSummary({ ...TIPS_SUMMARY, tipCoverage: null }),
    ).toBeNull();
    expect(
      normalizeTipsSummary({
        ...TIPS_SUMMARY,
        tipCoverage: { recordedInvoicesCount: "n/a", totalInvoicesCount: 4 },
      }),
    ).toBeNull();
  });

  it("integrates into normalizeDashboardReport: absent tipsSummary stays null", () => {
    const report = normalizeDashboardReport({ netSalesNio: "48520.5" });
    expect(report.tipsSummary).toBeNull();
    expect(
      normalizeDashboardReport({ tipsSummary: TIPS_SUMMARY }).tipsSummary,
    ).toEqual(TIPS_SUMMARY);
  });
});

describe("tip pure math (kpi-deltas, PRD §21.2/§21.4)", () => {
  it("computes tipped-ticket participation as tipped / eligible completed × 100", () => {
    expect(tipParticipationPercent(2, 4)).toBe(50);
    expect(tipParticipationPercent(0, 4)).toBe(0);
    expect(tipParticipationPercent(3, 4)).toBeCloseTo(75);
  });

  it("returns null participation without a completed-ticket base, never a fake 0%", () => {
    expect(tipParticipationPercent(0, 0)).toBeNull();
    expect(tipParticipationPercent(2, Number.NaN)).toBeNull();
  });

  it("gates applicability on tip coverage (PRD §21.4)", () => {
    expect(isTipsSummaryApplicable(null)).toBe(false);
    expect(isTipsSummaryApplicable(LEGACY_NULL_SUMMARY)).toBe(false);
    expect(isTipsSummaryApplicable(TIPS_SUMMARY)).toBe(true);
  });

  it("exposes the current-period tips summary on the KPI snapshot (Batch 7)", () => {
    const current = normalizeDashboardReport({
      netSalesNio: "1000",
      completedTicketCount: "4",
      totalTaxNio: "0",
      totalDiscountsNio: "0",
      tipsSummary: TIPS_SUMMARY,
    });
    const snapshot = buildKpiSnapshot(current, null, null, null);
    expect(snapshot?.tipsSummary).toEqual(TIPS_SUMMARY);
  });
});

describe("TipsSummaryCard (PRD §21.2/§21.4)", () => {
  it("renders the tip KPI set with currency and percent formatting", () => {
    render(<TipsSummaryCard summary={TIPS_SUMMARY} />);

    expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    expect(screen.getByText("Total Propinas")).toBeInTheDocument();
    expect(screen.getByText("C$130.00")).toBeInTheDocument();
    expect(screen.getByText("Tasa de Propina")).toBeInTheDocument();
    expect(screen.getByText("8.1%")).toBeInTheDocument();
    expect(screen.getByText("Ticket promedio de propina")).toBeInTheDocument();
    expect(screen.getByText("C$65.00")).toBeInTheDocument();
    expect(screen.getByText("Participación")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });

  it("renders em-dashes for null rate/average instead of fabricated zeros", () => {
    render(
      <TipsSummaryCard
        summary={{
          ...TIPS_SUMMARY,
          averageTipNio: null,
          tipRate: null,
        }}
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders real zeros for a full-coverage, all-declined period (AD-10 distinction)", () => {
    render(
      <TipsSummaryCard
        summary={{
          totalTipsNio: 0,
          tippedTicketCount: 0,
          averageTipNio: null,
          tipRate: 0,
          tipCoverage: { recordedInvoicesCount: 5, totalInvoicesCount: 5 },
        }}
      />,
    );
    expect(screen.getByText("C$0.00")).toBeInTheDocument();
    expect(screen.getAllByText("0.0%")).toHaveLength(2);
  });

  it("omits the card entirely when the summary is null (PRD §21.4)", () => {
    const { container } = render(<TipsSummaryCard summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("omits the card when the period has zero recorded tips (legacy NULL rows)", () => {
    const { container } = render(<TipsSummaryCard summary={LEGACY_NULL_SUMMARY} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DashboardPage — tips summary band (Batch 7)", () => {
  const salesPagePayload = {
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
  };

  function mockPage(snapshotTips: typeof TIPS_SUMMARY | null) {
    vi.mocked(useSalesDashboard).mockReturnValue({
      data: salesPagePayload,
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useDashboardKpis).mockReturnValue({
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
        tipsSummary: snapshotTips,
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
    } as never);
  }

  function renderPage() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>,
    );
  }

  it("renders the tips card in the management layer when tip data is present", () => {
    mockPage(TIPS_SUMMARY);
    renderPage();

    expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    expect(screen.getByText("C$130.00")).toBeInTheDocument();
    // Tips stay outside the sales summary band (PRD §21.3).
    expect(screen.getByText("Resumen de Ventas")).toBeInTheDocument();
  });

  it("omits the tips card when tips are inapplicable and keeps the page intact (PRD §21.4)", () => {
    mockPage(null);
    renderPage();

    expect(screen.queryByTestId("tips-summary-card")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Resumen de Ventas")).toBeInTheDocument();
  });
});

describe("KpiStrip — Batch 7 tips payload regression (additive field)", () => {
  it("keeps the strip matrix intact when the report carries a tips summary", async () => {
    const { KpiStrip } = await import("@/features/dashboard/kpi-strip");
    const { fetchDashboardReport, fetchFiscalSetup } = await import(
      "@/features/dashboard/dashboard-api"
    );
    const { fetchCogs } = await import("@/features/inventory/inventory-api");
    const { useAuthStore } = await import("@/features/auth/auth-store");

    const salesPayload = {
      grossSales: 56425.7,
      netTaxableSales: 48520.5,
      totalTax: 6341.25,
      totalDiscounts: 1564.95,
      invoiceCount: 175,
      ticketAverage: 322.43,
      netSalesNio: 48520.5,
      preDiscountSalesNio: 50085.45,
      completedTicketCount: 171,
      averageTicketNetNio: 283.74,
      totalTaxNio: 6341.25,
      totalDiscountsNio: 1564.95,
      tipsSummary: TIPS_SUMMARY,
      reportingPeriod: {
        timezone: "America/Managua",
        localStartDate: "2026-09-23",
        localEndDate: "2026-09-23",
      },
      generatedAt: "2026-09-23T21:54:00Z",
    };

    vi.mocked(fetchDashboardReport).mockResolvedValue(salesPayload as never);
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
    vi.mocked(fetchCogs).mockResolvedValue({
      fromDate: "2026-09-23",
      toDate: "2026-09-23",
      totalCogsNio: 18740,
      salesCogsNio: 18740,
      shrinkageCogsNio: 0,
      generatedAt: "2026-09-23T21:54:00Z",
      items: [],
    } as never);
    useAuthStore.setState({
      user: {
        id: "user-1",
        email: "owner@test.ni",
        name: "Owner",
        role: "OWNER",
        tenantId: "tenant-1",
        active: true,
      },
      tenant: { id: "tenant-1", name: "Test", slug: "test", ruc: "", active: true },
      isAuthenticated: true,
      hydrated: true,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={client}>
        <KpiStrip range={{ start: "2026-09-23", end: "2026-09-23" }} today="2026-09-23" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    // The tips summary is additive metadata — the strip itself does not
    // render a tips tile (PRD §21.3 separation of flows).
    expect(screen.queryByTestId("tips-summary-card")).not.toBeInTheDocument();
  });
});
