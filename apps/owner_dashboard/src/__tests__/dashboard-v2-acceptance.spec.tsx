/**
 * Dashboard V2 — Batch 8 pilot acceptance suite (PRD §29–30, AC-01..AC-17,
 * Gates A–F).
 *
 * Authority: docs/dashboard/owner_dashboard_v2_prd_v1.0.md §29 (acceptance
 * scenarios AC-01..AC-17) and §30 (release gates); execution roadmap Batch 8.
 *
 * Deterministic fixtures mirror the per-batch suites (strip/attention/charts/
 * tips): the fetch layer is mocked while the real normalization, delta,
 * freshness-independent hook logic and rendering run under a real
 * QueryClient. Every fixture total reconciles by construction so the Gate A
 * KPI contract is exercised end-to-end, not re-derived per widget.
 *
 * AC coverage placement note: AC-08 (stale complete sync), AC-09 (unknown
 * sync) and AC-09A (quiet store with fresh checkpoints stays COMPLETE) are
 * asserted visually through the freshness badge, which is wired to the real
 * GET /operations/sync/freshness read model (PRD §20, FR-SYNC-01..05). The
 * state derivation rules behind each scenario are additionally proven against
 * the real endpoint in the backend acceptance integration proof:
 * test/sales/dashboard-v2-acceptance.db.e2e-spec.ts (AC-08/AC-09A describes).
 */
import type { ComponentProps, ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { KpiStrip } from "@/features/dashboard/kpi-strip";
import { PerformanceBand } from "@/features/dashboard/performance-band";
import { AttentionBand } from "@/features/dashboard/attention-band";
import { TipsSummaryCard } from "@/features/dashboard/tips-summary";
import {
  fetchAuditSummary,
  fetchCardReconciliationSummary,
  fetchDailySeries,
  fetchDashboardReport,
  fetchFiscalSetup,
  fetchHourlyReport,
  fetchSyncFreshness,
  normalizeDashboardReport,
  type DashboardV2Report,
} from "@/features/dashboard/dashboard-api";
import { fetchAlerts, fetchCogs } from "@/features/inventory/inventory-api";
import type { InventoryCoverage } from "@/features/inventory/inventory-types";
import {
  fetchSequenceAudit,
  fetchVoidedInvoices,
} from "@/features/fiscal/fiscal-api";
import {
  fetchSalesDashboard,
  fetchTopProducts,
} from "@/features/sales/sales-api";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";
import { useAuthStore } from "@/features/auth/auth-store";
import { formatLocalDate } from "@/lib/utils";
import type { User, UserRole } from "@/types";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchDashboardReport: vi.fn(),
  fetchFiscalSetup: vi.fn(),
  fetchDailySeries: vi.fn(),
  fetchHourlyReport: vi.fn(),
  fetchAuditSummary: vi.fn(),
  fetchCardReconciliationSummary: vi.fn(),
  fetchSyncFreshness: vi.fn(),
}));

vi.mock("@/features/inventory/inventory-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAlerts: vi.fn(),
  fetchCogs: vi.fn(),
}));

vi.mock("@/features/fiscal/fiscal-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSequenceAudit: vi.fn(),
  fetchVoidedInvoices: vi.fn(),
}));

vi.mock("@/features/sales/sales-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSalesDashboard: vi.fn(),
  fetchTopProducts: vi.fn(),
}));

vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(),
}));

// recharts ResponsiveContainer needs a ResizeObserver; jsdom has none.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver =
  window.ResizeObserver ??
  (ResizeObserverStub as unknown as typeof ResizeObserver);

// ---------------------------------------------------------------------------
// Deterministic fixture clock: Wednesday 2026-09-23 (AC-05 uses Tuesday
// 2026-09-22 -> previous Tuesday 2026-09-15, the single-day same-weekday
// resolver rule).
// ---------------------------------------------------------------------------

const DAY = "2026-09-23";
const TUESDAY = "2026-09-22";
const WEEK = { start: "2026-09-18", end: DAY };
const GENERATED_AT = "2026-09-23T21:54:00Z";

/**
 * AC-01 fixture — normal Régimen General sales day (Gate A totals):
 * Net Sales 48,520.50; Completed Tickets 171; Average Ticket 283.74;
 * Discounts 1,564.95; Pre-discount 50,085.45; IVA 6,341.25.
 * COGS fixture: sales COGS 18,740 -> margin 29,780.50 = 61.4% (AC-06).
 */
const SALES_DAY = {
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
  reportingPeriod: {
    timezone: "America/Managua",
    localStartDate: DAY,
    localEndDate: DAY,
  },
  generatedAt: GENERATED_AT,
};

const ZERO_SALES_DAY = {
  grossSales: 0,
  netTaxableSales: 0,
  totalTax: 0,
  totalDiscounts: 0,
  invoiceCount: 0,
  ticketAverage: 0,
  netSalesNio: 0,
  preDiscountSalesNio: 0,
  completedTicketCount: 0,
  averageTicketNetNio: null,
  totalTaxNio: 0,
  totalDiscountsNio: 0,
  reportingPeriod: null,
  generatedAt: GENERATED_AT,
};

/**
 * COGS fixture. Review round 2 P0 #4: the read model now carries
 * `inventoryCoverage` (WU2/WU11) and the margin ratio is gated on it, so the
 * default is COMPLETE coverage over the fixture's costed sales; individual
 * scenarios override it per case.
 */
const cogsFixture = (
  salesCogsNio: number,
  shrinkageCogsNio = 0,
  from = DAY,
  coverage: InventoryCoverage | Record<string, unknown> | null = {
    status: "COMPLETE",
    costedSalesCount: salesCogsNio > 0 ? 171 : 0,
    uncostedSalesCount: 0,
    reasonCodes: [],
  },
) => ({
  fromDate: from,
  toDate: from,
  totalCogsNio: salesCogsNio + shrinkageCogsNio,
  salesCogsNio,
  shrinkageCogsNio,
  // Key omitted entirely = the backend sent no coverage (gate closes).
  ...(coverage !== null ? { inventoryCoverage: coverage } : {}),
  generatedAt: GENERATED_AT,
  items: [],
});

const alertsFixture = (overrides: Record<string, unknown> = {}) => ({
  totalAlertsCount: 0,
  criticalCount: 0,
  warningCount: 0,
  negativeCount: 0,
  generatedAt: GENERATED_AT,
  alerts: [],
  ...overrides,
});

const reconciliationFixture = (overrides: Record<string, unknown> = {}) => ({
  pendingCount: 0,
  pendingAmountNio: 0,
  oldestPendingAt: null,
  generatedAt: GENERATED_AT,
  ...overrides,
});

const voidsFixture = (overrides: Record<string, unknown> = {}) => ({
  totalVoidedCount: 0,
  totalVoidedAmount: 0,
  generatedAt: GENERATED_AT,
  invoices: [],
  ...overrides,
});

const sequenceFixture = (overrides: Record<string, unknown> = {}) => ({
  startSequence: 1,
  endSequence: 10,
  expectedCount: 10,
  actualCount: 10,
  missingSequences: [],
  duplicateSequences: [],
  hasGaps: false,
  series: [],
  generatedAt: GENERATED_AT,
  ...overrides,
});

const auditFixture = (overrides: Record<string, unknown> = {}) => ({
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  latestHighSeverity: null,
  generatedAt: GENERATED_AT,
  ...overrides,
});

const TIPS_APPLICABLE = {
  totalTipsNio: 130,
  tippedTicketCount: 2,
  averageTipNio: 65,
  tipRate: 8.13,
  tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
};

/**
 * Sync-freshness fixture (Batch 3 endpoint contract, PRD §20). The default
 * keeps the non-freshness page tests in the healthy COMPLETE state; the
 * AC-08/AC-09/AC-09A scenarios override per case.
 */
const freshnessFixture = (overrides: Record<string, unknown> = {}) => ({
  state: "COMPLETE",
  thresholdMinutes: 5,
  lastCompleteAt: "2026-09-23T21:52:00Z",
  perTerminal: [
    {
      terminalId: "term-1",
      label: "Caja 1",
      state: "COMPLETE",
      acceptedThroughSequence: 41,
      lastReceiptAt: "2026-09-23T21:52:30Z",
    },
  ],
  evaluatedAt: GENERATED_AT,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockDashboardReport(
  current: Record<string, unknown>,
  previous: Record<string, unknown> = {},
  currentKey = DAY,
) {
  // The page component anchors its range on the REAL system date (it owns a
  // todayRange() state); the strip tests inject a deterministic range. Both
  // current-period keys resolve to the current fixture so page-level tests
  // stay deterministic without mocking the hook away.
  const currentKeys = new Set([currentKey, formatLocalDate(new Date())]);
  vi.mocked(fetchDashboardReport).mockImplementation(((start: string) => {
    if (currentKeys.has(start)) {
      return Promise.resolve({ ...SALES_DAY, ...current } as unknown as DashboardV2Report);
    }
    return Promise.resolve({ ...SALES_DAY, ...previous } as unknown as DashboardV2Report);
  }) as typeof fetchDashboardReport);
}

function mockCogs(currentSalesCogs: number, currentShrinkage = 0) {
  vi.mocked(fetchCogs).mockImplementation(((from: string) =>
    Promise.resolve(
      from === DAY
        ? cogsFixture(currentSalesCogs, currentShrinkage)
        : cogsFixture(19422.09, 0, from),
    )) as typeof fetchCogs);
}

function mockHealthyAttention() {
  vi.mocked(fetchAlerts).mockResolvedValue(alertsFixture() as never);
  vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
    reconciliationFixture() as never,
  );
  vi.mocked(fetchVoidedInvoices).mockResolvedValue(voidsFixture() as never);
  vi.mocked(fetchSequenceAudit).mockResolvedValue(sequenceFixture() as never);
  vi.mocked(fetchAuditSummary).mockResolvedValue(auditFixture() as never);
}

function mockCharts(
  payloads: {
    daily?: unknown;
    hourly?: unknown;
    topProducts?: unknown;
    paymentMix?: unknown;
  } = {},
) {
  const days = (pairs: Array<[string, number]>) =>
    pairs.map(([date, net]) => ({
      date,
      netSalesNio: net,
      completedTicketCount: 4,
      averageTicketNetNio: net / 4,
    }));
  vi.mocked(fetchDailySeries).mockResolvedValue(
    (payloads.daily ?? {
      days: days([
        [WEEK.start, 6800],
        ["2026-09-19", 7200],
        ["2026-09-20", 5900],
        ["2026-09-21", 7400],
        ["2026-09-22", 8100],
        [DAY, 8800],
      ]),
      reportingPeriod: {
        timezone: "America/Managua",
        localStartDate: WEEK.start,
        localEndDate: WEEK.end,
      },
      generatedAt: GENERATED_AT,
    }) as never,
  );
  vi.mocked(fetchHourlyReport).mockResolvedValue(
    (payloads.hourly ?? {
      date: WEEK.end,
      dayCount: 6,
      generatedAt: GENERATED_AT,
      hourly: [
        { hour: 8, invoiceCount: 3, netSalesNio: 900 },
        { hour: 12, invoiceCount: 5, netSalesNio: 1500 },
        { hour: 19, invoiceCount: 4, netSalesNio: 1200 },
      ],
    }) as never,
  );
  vi.mocked(fetchTopProducts).mockResolvedValue(
    (payloads.topProducts ?? {
      startDate: WEEK.start,
      endDate: WEEK.end,
      generatedAt: GENERATED_AT,
      products: [
        { productName: "Cafe Latte", totalQuantity: 40, netRevenueNio: 8400 },
        { productName: "Espresso Doble", totalQuantity: 25, netRevenueNio: 5200 },
      ],
    }) as never,
  );
  vi.mocked(fetchSalesDashboard).mockResolvedValue(
    (payloads.paymentMix ?? {
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
      generatedAt: GENERATED_AT,
    }) as never,
  );
}

function authUser(role: UserRole, permissions?: string[]): User {
  const base: User = {
    id: "user-1",
    email: "user@test.ni",
    name: "Test User",
    role,
    tenantId: "tenant-1",
    active: true,
  };
  return permissions ? ({ ...base, permissions } as User) : base;
}

function setAuthUser(role: UserRole, permissions?: string[]) {
  useAuthStore.setState({
    user: authUser(role, permissions),
    tenant: { id: "tenant-1", name: "Test", slug: "test", ruc: "", active: true },
    isAuthenticated: true,
    hydrated: true,
  });
}

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

function renderStrip(props: Partial<ComponentProps<typeof KpiStrip>> = {}) {
  return renderWithProviders(
    <KpiStrip range={{ start: DAY, end: DAY }} today={DAY} {...props} />,
  );
}

function tileByLabel(label: string): HTMLElement | undefined {
  return screen
    .getAllByTestId("kpi-tile")
    .find((el) => el.textContent?.includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser("OWNER");
  vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "REGIMEN_GENERAL" });
  mockCogs(18740);
  mockHealthyAttention();
  mockCharts();
  vi.mocked(fetchSyncFreshness).mockResolvedValue(freshnessFixture() as never);
  vi.mocked(useSalesDashboard).mockReturnValue({
    data: {
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
      generatedAt: GENERATED_AT,
    },
    isLoading: false,
    error: null,
  } as never);
});

// ---------------------------------------------------------------------------
// AC-01 — Normal Régimen General sales day
// ---------------------------------------------------------------------------

describe("AC-01 — normal Régimen General sales day (Gate A/B)", () => {
  it("renders the five-slot executive strip with reconciled fixture totals", async () => {
    mockDashboardReport({});

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(5);
    });
    expect(tileByLabel("Ventas Netas")?.textContent).toContain("C$48,520.50");
    expect(tileByLabel("Tickets")?.textContent).toContain("171");
    expect(tileByLabel("Ticket Promedio")?.textContent).toContain("C$283.74");
    // The margin resolves one fetch round after the sales tiles (COGS is
    // enabled by the sales success) — wait for it explicitly.
    await waitFor(() => {
      expect(tileByLabel("Margen Bruto")?.textContent).toContain("61.4%");
    });
    expect(tileByLabel("IVA generado")?.textContent).toContain("C$6,341.25");
  });

  it("renders every PRD §29 widget and hides Attention when there are no exceptions", async () => {
    mockDashboardReport({});

    renderWithProviders(<PerformanceBand range={WEEK} today={DAY} />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hourly-card")).toBeInTheDocument();
    expect(screen.getByTestId("top-products-card")).toBeInTheDocument();
    expect(screen.getByTestId("payment-mix-card")).toBeInTheDocument();
    // PRD §19 scopes the panel to actionable exceptions and AC-11 only
    // requires the sequence row when `hasGaps = true`. With every signal
    // settled healthy there is nothing actionable, so the panel renders
    // nothing at all — no "todo bien" card competing for the owner's
    // attention (review round 2, WU4).
    await waitFor(() => {
      expect(screen.queryByTestId("attention-band")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
    expect(screen.getByTestId("top-products-rows").textContent).toContain(
      "Cafe Latte",
    );
    expect(screen.getByTestId("trend-legend")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-02 — Cuota Fija tenant
// ---------------------------------------------------------------------------

describe("AC-02 — Cuota Fija tenant (Gate B)", () => {
  it("renders the 4-card layout without the IVA card or any zero-IVA placeholder", async () => {
    mockDashboardReport({});
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getByText("Margen Bruto")).toBeInTheDocument();
    // The #544 fix: no meaningless IVA C$0.00 card, and no inferred tax
    // conclusion anywhere in the strip.
    expect(screen.queryByText("IVA generado")).not.toBeInTheDocument();
    expect(screen.queryByText("C$6,341.25")).not.toBeInTheDocument();
    expect(screen.queryByText("C$0.00")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fiscal-warning")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-03 — Discounts
// ---------------------------------------------------------------------------

describe("AC-03 — discount reconciliation (Gate A)", () => {
  it("reconciles Pre-discount Sales = Net Sales + Discounts and the discount rate from the fixture", () => {
    const report = normalizeDashboardReport({
      netSalesNio: "48520.5",
      totalDiscountsNio: "1564.95",
      preDiscountSalesNio: "50085.45",
      completedTicketCount: "171",
    });

    // PRD AC-03 identity over the deterministic fixture.
    expect(report.netSalesNio + report.totalDiscountsNio).toBeCloseTo(
      report.preDiscountSalesNio,
      2,
    );
    expect(report.preDiscountSalesNio).toBe(50085.45);

    // Discount Rate = Discounts / Pre-discount Sales.
    const discountRate =
      (report.totalDiscountsNio / report.preDiscountSalesNio) * 100;
    expect(discountRate).toBeCloseTo(3.1246, 3);
  });
});

// ---------------------------------------------------------------------------
// AC-04 — Zero-sales day
// ---------------------------------------------------------------------------

describe("AC-04 — zero-sales day", () => {
  it("renders genuine zeros, the em-dash average/margin and the no-activity note", async () => {
    mockDashboardReport(ZERO_SALES_DAY, ZERO_SALES_DAY);
    vi.mocked(fetchCogs).mockResolvedValue(cogsFixture(0) as never);

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText(/sin actividad registrada/i)).toBeInTheDocument();
    });
    expect(tileByLabel("Ventas Netas")?.textContent).toContain("C$0.00");
    expect(tileByLabel("Tickets")?.textContent).toContain("0");
    expect(tileByLabel("Ticket Promedio")?.textContent).toContain("—");
    expect(tileByLabel("Margen Bruto")?.textContent).toContain("—");
    expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
  });

  it("suppresses meaningless sales charts while keeping the widgets alive", async () => {
    mockCharts({
      daily: {
        days: [],
        reportingPeriod: {
          timezone: "America/Managua",
          localStartDate: WEEK.start,
          localEndDate: WEEK.end,
        },
        generatedAt: GENERATED_AT,
      },
      hourly: {
        date: WEEK.end,
        dayCount: 6,
        generatedAt: GENERATED_AT,
        hourly: [],
      },
      topProducts: {
        startDate: WEEK.start,
        endDate: WEEK.end,
        generatedAt: GENERATED_AT,
        products: [],
      },
      paymentMix: {
        grossSales: 0,
        netTaxableSales: 0,
        totalTax: 0,
        totalDiscounts: 0,
        invoiceCount: 0,
        ticketAverage: 0,
        paymentMethodsBreakdown: {
          cashNio: 0,
          cashUsd: 0,
          cardNio: 0,
          cardUsd: 0,
          other: 0,
          totalNio: 0,
        },
        generatedAt: GENERATED_AT,
      },
    });

    renderWithProviders(<PerformanceBand range={WEEK} today={DAY} />);

    await waitFor(() => {
      expect(screen.getByTestId("trend-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hourly-empty")).toBeInTheDocument();
    expect(screen.getByTestId("top-products-empty")).toBeInTheDocument();
    expect(screen.getByTestId("payment-mix-empty")).toBeInTheDocument();
    // No fabricated zero-line/zero-bars: each card shows its explicit
    // no-sales state instead.
    expect(screen.queryByTestId("trend-legend")).not.toBeInTheDocument();
  });

  it("keeps operational alerts visible on a zero-sales day", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsFixture({ criticalCount: 2, totalAlertsCount: 2 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-stock").textContent).toContain(
      "2 producto",
    );
  });
});

// ---------------------------------------------------------------------------
// AC-05 — Period comparison
// ---------------------------------------------------------------------------

describe("AC-05 — period comparison", () => {
  it("compares the current Tuesday against the previous Tuesday by default", async () => {
    mockDashboardReport(
      { netSalesNio: 48520.5, completedTicketCount: 171, averageTicketNetNio: 283.74 },
      { netSalesNio: 43160.2, completedTicketCount: 150, averageTicketNetNio: 287.73 },
      TUESDAY,
    );

    renderStrip({ range: { start: TUESDAY, end: TUESDAY }, today: TUESDAY });

    await waitFor(() => {
      expect(screen.getByText("+12.4%")).toBeInTheDocument();
    });
    // Single-day same-weekday rule: 2026-09-22 -> 2026-09-15.
    expect(screen.getAllByText("vs martes anterior").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("↑").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the em-dash 'Sin base comparable' when the previous base is zero, never +100%", async () => {
    mockDashboardReport({}, ZERO_SALES_DAY, TUESDAY);

    renderStrip({ range: { start: TUESDAY, end: TUESDAY }, today: TUESDAY });

    await waitFor(() => {
      expect(tileByLabel("Ventas Netas")?.textContent).toContain(
        "Sin base comparable",
      );
    });
    expect(screen.queryByText(/\+100%/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-06 — COGS / Gross Margin (merma stays separate)
// ---------------------------------------------------------------------------

describe("AC-06 — COGS / Gross Margin reconciliation (Gate A)", () => {
  it("reconciles margin to Net Sales - Sales COGS and never to total COGS incl. merma", async () => {
    mockDashboardReport({});
    // totalCogsNio deliberately includes 2,000 of shrinkage (merma): the
    // margin must use salesCogsNio only.
    mockCogs(18740, 2000);

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Margen Bruto")?.textContent).toContain("61.4%");
    });
    expect(tileByLabel("Margen Bruto")?.textContent).toContain("C$29,780.50");
    // (48,520.50 - 20,740) / 48,520.50 = 57.3% — the merma-contaminated
    // figure must never render.
    expect(screen.queryByText("57.3%")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-08 / AC-09 / AC-09A — Freshness (PRD §20, FR-SYNC-01..05)
//
// The freshness badge is now wired to the real GET /operations/sync/freshness
// read model, so the tenant-level states are asserted visually in the DOM
// (state attribute + explicit text; color is never the only signal). The
// derivation rules behind each state are additionally pinned against the real
// endpoint + derivation in
// apps/admin_backend/test/sales/dashboard-v2-acceptance.db.e2e-spec.ts.
// ---------------------------------------------------------------------------

describe("AC-08 / AC-09 / AC-09A — freshness badge (FR-SYNC-01..05)", () => {
  it("AC-08: complete streams 20 minutes old show STALE, not COMPLETE", async () => {
    mockDashboardReport({});
    vi.mocked(fetchSyncFreshness).mockResolvedValue(
      freshnessFixture({
        state: "STALE",
        lastCompleteAt: "2026-09-23T21:34:00Z",
      }) as never,
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toHaveAttribute(
        "data-freshness-state",
        "STALE",
      );
    });
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain("Sincronización demorada (>5 min)");
    expect(badge.textContent).toContain("· hasta ");
    expect(badge.textContent).not.toContain("Datos completos");
  });

  it("AC-09: no completeness metadata shows UNKNOWN and never substitutes generatedAt", async () => {
    mockDashboardReport({});
    vi.mocked(fetchSyncFreshness).mockResolvedValue(
      freshnessFixture({
        state: "UNKNOWN",
        lastCompleteAt: null,
        perTerminal: [],
      }) as never,
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toHaveAttribute(
        "data-freshness-state",
        "UNKNOWN",
      );
    });
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain(
      "No se puede verificar la completitud de los datos",
    );
    // FR-SYNC-04 / AC-09: generatedAt remains separate technical metadata —
    // it appears only in its own labeled caption, never as a freshness claim.
    expect(badge.textContent).not.toContain("Actualizado");
    expect(screen.getByText(/Reporte generado:/)).toBeInTheDocument();
  });

  it("AC-09A: a quiet store with current checkpoints stays COMPLETE", async () => {
    mockDashboardReport({});
    // No business activity for 30 minutes, but the sync checkpoint proves no
    // pending work: COMPLETE with no time claims — never STALE (AC-09A).
    vi.mocked(fetchSyncFreshness).mockResolvedValue(
      freshnessFixture({
        lastCompleteAt: null,
        perTerminal: [
          {
            terminalId: "term-1",
            label: "Caja 1",
            state: "COMPLETE",
            acceptedThroughSequence: 41,
            lastReceiptAt: null,
          },
        ],
      }) as never,
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toHaveAttribute(
        "data-freshness-state",
        "COMPLETE",
      );
    });
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain("Datos completos");
    expect(badge.textContent).not.toContain("demorada");
    expect(badge.textContent).not.toContain("parcial");
  });

  it("R-10: COMPLETE with pending inventory appends '· inventario pendiente', not network blame", async () => {
    mockDashboardReport({});
    // Sales synced; the inventory application of those sales is still
    // pending. The caption must say so — never a network/sync-lag claim.
    vi.mocked(fetchSyncFreshness).mockResolvedValue(
      freshnessFixture({
        hasInventoryPending: true,
        inventoryPendingCount: 2,
        perTerminal: [
          {
            terminalId: "term-1",
            label: "Caja 1",
            state: "COMPLETE",
            acceptedThroughSequence: 41,
            lastReceiptAt: "2026-09-23T21:52:30Z",
            hasInventoryPending: true,
            inventoryPendingCount: 2,
          },
        ],
      }) as never,
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toHaveAttribute(
        "data-freshness-state",
        "COMPLETE",
      );
    });
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain("Datos completos");
    expect(badge.textContent).toContain("· inventario pendiente");
    expect(badge.textContent).not.toContain("demorada");
    // Tooltip clarifies: records reached the cloud; inventory processing is
    // what is pending — not the network.
    expect(badge.getAttribute("title")).toContain(
      "procesamiento de inventario",
    );
  });

  it("R-10: STALE with pending inventory does not blame the network", async () => {
    mockDashboardReport({});
    // The watermark age comes from receipts whose inventory outcome is still
    // pending: sales are synced, inventory is not. 'Sincronización demorada'
    // would send the operator hunting for a network drop that does not exist.
    vi.mocked(fetchSyncFreshness).mockResolvedValue(
      freshnessFixture({
        state: "STALE",
        lastCompleteAt: "2026-09-23T21:34:00Z",
        hasInventoryPending: true,
        inventoryPendingCount: 3,
      }) as never,
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toHaveAttribute(
        "data-freshness-state",
        "STALE",
      );
    });
    const badge = screen.getByTestId("freshness-badge");
    expect(badge.textContent).toContain(
      "Sincronización al día · inventario pendiente de aplicar",
    );
    expect(badge.textContent).not.toContain("demorada");
    expect(badge.getAttribute("title")).toContain(
      "procesamiento de inventario",
    );
  });
});

// ---------------------------------------------------------------------------
// AC-10..AC-13 — Attention Required signals
// ---------------------------------------------------------------------------

describe("AC-10..AC-13 — attention signals (Gate E surfaces)", () => {
  it("AC-10: stock critical renders with critical severity and links to Inventory", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsFixture({ criticalCount: 3, totalAlertsCount: 3 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-stock")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(screen.getByTestId("attention-item-stock").textContent).toContain(
      "3 producto(s) en nivel crítico",
    );
    expect(
      screen.getByTestId("attention-link-stock").getAttribute("href"),
    ).toContain("/inventory?source=dashboard");
    expect(
      screen.getByTestId("attention-link-stock").getAttribute("href"),
    ).toContain("tab=alerts");
  });

  it("AC-11: fiscal sequence gaps render as critical and link to the Fiscal audit", async () => {
    vi.mocked(fetchSequenceAudit).mockResolvedValue(
      sequenceFixture({ hasGaps: true, missingSequences: [4], actualCount: 9 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-sequence")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-sequence")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(screen.getByTestId("attention-item-sequence").textContent).toContain(
      "Gaps en secuencia fiscal",
    );
    expect(
      screen.getByTestId("attention-link-sequence").getAttribute("href"),
    ).toContain("/fiscal?source=dashboard");
    expect(
      screen.getByTestId("attention-link-sequence").getAttribute("href"),
    ).toContain("tab=sequence");
  });

  it("AC-12: voids render count/amount as a warning row, never merged into sales", async () => {
    vi.mocked(fetchVoidedInvoices).mockResolvedValue(
      voidsFixture({ totalVoidedCount: 2, totalVoidedAmount: 840 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-voids")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-voids")).toHaveAttribute(
      "data-severity",
      "warning",
    );
    expect(screen.getByTestId("attention-item-voids").textContent).toContain(
      "2 anulaciones",
    );
    expect(screen.getByTestId("attention-item-voids").textContent).toContain(
      "C$840.00",
    );
    // The void row lives in the attention section only — the sales widgets
    // are not rendered here at all, so voids can never enter Net Sales.
    expect(screen.queryByTestId("kpi-tile")).not.toBeInTheDocument();
  });

  it("AC-13: pending vouchers render count/amount and link to reconciliation", async () => {
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationFixture({ pendingCount: 3, pendingAmountNio: 840.5 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-vouchers")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-vouchers")).toHaveAttribute(
      "data-severity",
      "warning",
    );
    expect(screen.getByTestId("attention-item-vouchers").textContent).toContain(
      "3 voucher(s) pendientes",
    );
    expect(screen.getByTestId("attention-item-vouchers").textContent).toContain(
      "C$840.50",
    );
    expect(
      screen.getByTestId("attention-link-vouchers").getAttribute("href"),
    ).toContain("/sales?source=dashboard");
    expect(
      screen.getByTestId("attention-link-vouchers").getAttribute("href"),
    ).toContain("tab=summary");
  });

  it("AC-13 (audit summary): severity counts surface from the audit executive summary", async () => {
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditFixture({ criticalCount: 1, warningCount: 2, infoCount: 4 }) as never,
    );

    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-audit")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-audit")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(screen.getByTestId("attention-item-audit").textContent).toContain(
      "1 evento(s) crítico(s)",
    );
  });

  it("hides the whole panel once every signal settled without critical/warning findings", async () => {
    renderWithProviders(<AttentionBand range={{ start: DAY, end: DAY }} />);

    // Exceptions-only contract (PRD §19): a fully healthy signal set is not
    // an exception, so the section is absent rather than announcing "Todo en
    // orden". The reclaimed space goes to the sibling chart cells.
    await waitFor(() => {
      expect(screen.queryByTestId("attention-band")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-stock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-vouchers")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-voids")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-audit")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-14 / AC-15 — Tips (Gate E; Restaurant/Hybrid GA)
// ---------------------------------------------------------------------------

describe("AC-14 — tips after remediation (separate flow, reconciled KPIs)", () => {
  it("renders the tips card in the bottom management band without perturbing Net Sales", async () => {
    mockDashboardReport({ tipsSummary: TIPS_APPLICABLE });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    });
    // The card is no longer a liveness probe: WU5 made it always-render (the
    // Descuentos row survives a null tip summary), so its presence proves
    // nothing about the data. Wait on the report actually settling instead of
    // racing the async queries.
    await waitFor(() => {
      expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
    });
    // Tip KPI set reconciles to the fixture (PRD §21.2; sale-time base).
    expect(screen.getByText("Total Propinas")).toBeInTheDocument();
    expect(screen.getByText("C$130.00")).toBeInTheDocument();
    expect(screen.getByText("8.1%")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    // Separation of flows: the executive hero stays tip-free at C$48,520.50
    // (130 tips would render C$48,650.50 if merged — it must not).
    expect(tileByLabel("Ventas Netas")?.textContent).toContain("C$48,520.50");
    expect(tileByLabel("Ventas Netas")?.textContent).not.toContain("C$48,650.50");
  });
});

describe("AC-15 — tip-inapplicable tenant (omit, never zero placeholders)", () => {
  it("keeps the flows card for discounts while hiding tips when the period has no tip coverage", async () => {
    mockDashboardReport({ tipsSummary: null });

    renderWithProviders(<DashboardPage />);

    // PRD §21.4 still forbids zero-value tip placeholders, but the card itself
    // no longer disappears: it carries the always-visible Descuentos row now.
    // Assert the settled page so this cannot pass by racing an empty loading
    // state where the tips block is legitimately absent.
    await waitFor(() => {
      expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    expect(screen.getByTestId("management-band")).toBeInTheDocument();
    expect(screen.queryByText("Total Propinas")).not.toBeInTheDocument();
    // PRD §21.4 forbids zero-value TIP placeholders. The flows card is allowed
    // to show real discount money — pin that the tips block is absent while the
    // Descuentos row is present, instead of asserting a specific amount that
    // belongs to the shared sales fixture rather than to this acceptance case.
    const flowsCard = screen.getByTestId("tips-summary-card");
    expect(within(flowsCard).getByText("Descuentos")).toBeInTheDocument();
    expect(within(flowsCard).queryByText(/Propinas|Promedio por Propina/)).not.toBeInTheDocument();
    expect(screen.queryByText("Resumen de Ventas")).not.toBeInTheDocument();
  });

  it("treats legacy NULL-only coverage as inapplicable at the gate level", () => {
    expect(TIPS_APPLICABLE.tipCoverage.recordedInvoicesCount).toBeGreaterThan(0);
    // The gate itself (isTipsSummaryApplicable) is pinned at unit level in
    // dashboard-v2-tips.spec.tsx; here we pin the page-level consequence:
    // a null summary hides the TIPS BLOCK, while the flows card stays alive
    // for Descuentos (WU5).
    render(<TipsSummaryCard summary={null} />);
    expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    expect(screen.queryByText("Total Propinas")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-16 — Widget API failure isolation
// ---------------------------------------------------------------------------

describe("AC-16 — widget API failure isolation (Gate F posture)", () => {
  it("Top Products failure degrades locally while the core dashboard stays usable", async () => {
    mockDashboardReport({});
    // The Attention panel is exceptions-only (PRD §19), so a fully healthy
    // signal set legitimately renders nothing and cannot serve as a liveness
    // probe. One real exception makes the panel render, which proves the
    // stronger property: a data-bearing Attention panel survives a sibling
    // widget's API failure.
    vi.mocked(fetchSequenceAudit).mockResolvedValue(
      sequenceFixture({ hasGaps: true, missingSequences: [4], actualCount: 9 }) as never,
    );
    vi.mocked(fetchTopProducts).mockRejectedValue(
      new Error("top products endpoint down"),
    );

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("top-products-error")).toBeInTheDocument();
    });
    // Core dashboard remains usable: strip + sibling widgets all alive.
    expect(tileByLabel("Ventas Netas")?.textContent).toContain("C$48,520.50");
    expect(screen.getByTestId("hourly-card")).toBeInTheDocument();
    expect(screen.getByTestId("payment-mix-card")).toBeInTheDocument();
    expect(screen.getByTestId("attention-band")).toBeInTheDocument();
    expect(screen.getByTestId("attention-item-sequence")).toBeInTheDocument();
    // No full-page crash banner replaced the content.
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-17 — Permission-limited Manager
// ---------------------------------------------------------------------------

describe("AC-17 — permission-limited Manager (Gate F)", () => {
  it("hides COGS/Margin without INVENTORY_COST_VIEW and never fetches cost data", async () => {
    setAuthUser("MANAGER");
    // Cuota Fija matrix isolates the margin gate from the regime's 5th slot.
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
    mockDashboardReport({});

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    // No sensitive numeric surface: no margin tile, no figures leaked, and
    // no "Sin costo" note either — the tile is omitted, not degraded.
    expect(screen.queryByText("Margen Bruto")).not.toBeInTheDocument();
    expect(screen.queryByText("61.4%")).not.toBeInTheDocument();
    expect(screen.queryByText("C$18,740.00")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-margin-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin costo/)).not.toBeInTheDocument();
    expect(fetchCogs).not.toHaveBeenCalled();
  });

  it("restores the margin tile when the Manager carries the explicit grant", async () => {
    setAuthUser("MANAGER", ["inventory:cost_view"]);
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
    mockDashboardReport({});

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Margen Bruto")?.textContent).toContain("61.4%");
    });
    expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
  });
});
