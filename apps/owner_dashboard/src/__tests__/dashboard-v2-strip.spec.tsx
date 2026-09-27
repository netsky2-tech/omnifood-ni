/**
 * Dashboard V2 Batch 4 — regime-aware executive KPI strip.
 *
 * Authorities:
 * - PRD §§10.2 (FR-KPI-01..05), 12 (FR-FISCAL-01..04), 9.5, 23
 * - ui_wireframe_reference.md §1/§2 (4-card Cuota Fija matrix, 5th IVA slot)
 *
 * Mock style follows the existing suite (vi.mock + testing-library): the fetch
 * layer is mocked while the real normalization/delta/hook logic runs under a
 * real QueryClient. Mocked fetchers return the post-normalization shape the
 * real fetchDashboardReport produces; wire-string coercion is pinned at unit
 * level on normalizeDashboardReport.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KpiStrip, type KpiStripProps } from "@/features/dashboard/kpi-strip";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  fetchDashboardReport,
  fetchFiscalSetup,
  normalizeDashboardReport,
} from "@/features/dashboard/dashboard-api";
import { fetchCogs } from "@/features/inventory/inventory-api";

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

// G2 page-level tests render the real DashboardPage; its non-strip data
// sources are mocked at module level so the regime context label can be
// asserted against the real useDashboardKpis/fiscal fetch path.
vi.mock("@/features/sales/use-sales-reports", () => ({
  useSalesDashboard: vi.fn(() => ({
    data: {
      grossSales: 15000,
      netTaxableSales: 13000,
      totalTax: 1956,
      totalDiscounts: 500,
      generatedAt: "2026-09-23T21:54:00Z",
    },
    isLoading: false,
    error: null,
  })),
}));
vi.mock("@/features/dashboard/use-sync-freshness", () => ({
  useSyncFreshness: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock("@/features/dashboard/performance-band", () => ({
  PerformanceBand: () => <div data-testid="performance-band-mock" />,
}));

const CURRENT_RANGE = { start: "2026-09-23", end: "2026-09-23" };
const PREVIOUS_RANGE = { start: "2026-09-16", end: "2026-09-16" };
// Wednesday in America/Managua (es-NI); the single-day resolver rule maps
// 2026-09-23 -> 2026-09-16 (same weekday one week earlier).
const COMPARISON_LABEL = "vs miércoles anterior";

const salesPayload = (overrides: Record<string, unknown> = {}) => ({
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
  // Batch 7 (PRD §21): additive tips summary — the strip itself never renders
  // tips (PRD §21.3 separation of flows); the payload is carried for the
  // tips band consumer and must not perturb the regime matrix.
  tipsSummary: {
    totalTipsNio: 130,
    tippedTicketCount: 2,
    averageTipNio: 65,
    tipRate: 8.13,
    tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
  },
  reportingPeriod: {
    timezone: "America/Managua",
    localStartDate: CURRENT_RANGE.start,
    localEndDate: CURRENT_RANGE.end,
  },
  generatedAt: "2026-09-23T21:54:00Z",
  ...overrides,
});

const ZERO_SALES = {
  netSalesNio: 0, preDiscountSalesNio: 0, completedTicketCount: 0,
  averageTicketNetNio: null, totalTaxNio: 0, totalDiscountsNio: 0,
  grossSales: 0, netTaxableSales: 0, totalTax: 0, totalDiscounts: 0,
  invoiceCount: 0, ticketAverage: 0,
};

/**
 * Margin ratio is gated on coverage (WU3 / P0 #4): the percent only renders
 * when the period's inventoryCoverage is COMPLETE. A payload with no coverage
 * would now legitimately show "—", so every fixture states its coverage
 * explicitly instead of relying on the field being absent.
 */
const COMPLETE_COVERAGE = {
  status: "COMPLETE" as const,
  costedSalesCount: 12,
  uncostedSalesCount: 0,
};

const cogsPayload = (
  salesCogsNio: number,
  coverage: Record<string, unknown> | null = COMPLETE_COVERAGE,
) => ({
  fromDate: CURRENT_RANGE.start,
  toDate: CURRENT_RANGE.end,
  totalCogsNio: salesCogsNio,
  salesCogsNio,
  shrinkageCogsNio: 0,
  generatedAt: "2026-09-23T21:54:00Z",
  items: [],
  // null models an older wire that carries no coverage field at all.
  ...(coverage ? { inventoryCoverage: coverage } : {}),
});

function mockCogsDefault() {
  vi.mocked(fetchCogs).mockResolvedValue(cogsPayload(18740) as never);
}

function mockBothPeriods(
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
) {
  vi.mocked(fetchDashboardReport).mockImplementation(((start: string) => {
    if (start === CURRENT_RANGE.start) return Promise.resolve(salesPayload(current));
    if (start === PREVIOUS_RANGE.start) return Promise.resolve(salesPayload(previous));
    return Promise.reject(new Error(`unexpected range: ${start}`));
  }) as typeof fetchDashboardReport);
}

function mockSalesFailure() {
  vi.mocked(fetchDashboardReport).mockImplementation((() =>
    Promise.reject(new Error("sales endpoint down"))) as typeof fetchDashboardReport);
}

function renderStrip(props: Partial<KpiStripProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="sibling-widget">Métodos de Pago</div>
      <KpiStrip range={CURRENT_RANGE} today="2026-09-23" {...props} />
    </QueryClientProvider>,
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      {/* Review round 2 (WU5): DashboardPage now renders the Rentabilidad
          card's "Ver →" react-router Link for cost-granted users, so the page
          needs the router context it always has in the app shell. Without it
          Link throws while destructuring basename. MemoryRouter mirrors
          production without asserting navigation. */}
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function tileByLabel(label: string): HTMLElement | undefined {
  return screen
    .getAllByTestId("kpi-tile")
    .find((el) => el.textContent?.includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCogsDefault();
  vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
  // Batch 6b (AG-06/AC-17): the strip now gates cost surfaces behind the
  // inventory cost permission. These suites exercise the full strip, so they
  // run as OWNER; permission-limited cases live in the attention spec.
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
});

describe("normalizeDashboardReport (wire string-number normalization)", () => {
  it("coerces numeric strings and preserves null average ticket", () => {
    const report = normalizeDashboardReport({
      netSalesNio: "48520.5",
      completedTicketCount: "171",
      averageTicketNetNio: "283.74",
      totalTaxNio: "6341.25",
    });
    expect(report.netSalesNio).toBe(48520.5);
    expect(report.completedTicketCount).toBe(171);
    expect(report.averageTicketNetNio).toBe(283.74);
    expect(report.totalTaxNio).toBe(6341.25);
  });

  it("keeps absent averageTicketNetNio null and fails closed on garbage", () => {
    expect(normalizeDashboardReport({}).averageTicketNetNio).toBeNull();
    expect(normalizeDashboardReport({ averageTicketNetNio: null }).averageTicketNetNio).toBeNull();
    expect(normalizeDashboardReport({ averageTicketNetNio: "n/a" }).averageTicketNetNio).toBeNull();
    expect(normalizeDashboardReport({ netSalesNio: "n/a" }).netSalesNio).toBe(0);
  });
});

describe("KpiStrip — regime matrix (FR-FISCAL-03/FR-KPI-05)", () => {
  it("renders the 4-card Cuota Fija matrix with no IVA card", async () => {
    mockBothPeriods({}, {});

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getByText("Margen Bruto")).toBeInTheDocument();
    expect(screen.queryByText("IVA generado")).not.toBeInTheDocument();
  });

  it("renders the 5th IVA generado slot for Régimen General", async () => {
    mockBothPeriods({}, {});
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "REGIMEN_GENERAL" });

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(5);
    });
    expect(screen.getByText("IVA generado")).toBeInTheDocument();
    expect(screen.getByText("C$6,341.25")).toBeInTheDocument();
  });
});

describe("KpiStrip — unknown fiscal configuration (FR-FISCAL-04)", () => {
  it("shows a non-destructive warning and never infers IVA from tax totals", async () => {
    mockBothPeriods({}, {});
    vi.mocked(fetchFiscalSetup).mockRejectedValue(new Error("fiscal down"));

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("fiscal-warning")).toBeInTheDocument();
    });
    expect(screen.queryByText("IVA generado")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /configurar/i });
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("treats an invalid fiscal regime shape as unknown (no inference, no default)", async () => {
    mockBothPeriods({}, {});
    vi.mocked(fetchFiscalSetup).mockResolvedValue(null);

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("fiscal-warning")).toBeInTheDocument();
    });
    expect(screen.queryByText("IVA generado")).not.toBeInTheDocument();
  });
});

describe("KpiStrip — reflowing card grid (G3, FR-KPI-05)", () => {
  // The grid must be derived from the real tile count and never leave an empty
  // column or an orphaned wrapped tile. A fixed 4-track grid is the specific
  // regression being guarded: it holes at 3 tiles and orphans the 5th.
  const expectReflowGrid = (grid: HTMLElement, count: 3 | 4 | 5) => {
    // Every matrix is an explicit grid, and none of them is a bare fixed
    // 4-column desktop grid — that is what stranded the 5th tile.
    expect(grid.className).toContain("grid");
    if (count === 5) {
      // lg opens a 6-track field so the row can balance [2,2,2]+[3,3]; xl
      // returns to the wireframe's single 5-across row.
      expect(grid.className).toContain("lg:grid-cols-6");
      expect(grid.className).toContain("xl:grid-cols-5");
      expect(grid.className).not.toContain("lg:grid-cols-4");
      return;
    }
    // 3 and 4 tiles divide their own track count exactly, so they need no
    // spans — only that some breakpoint step lands on precisely `count`
    // columns and never on a 4-track field that would hole at 3.
    const trackCounts = [...grid.className.matchAll(/(?:^|\s)(?:sm|md|lg|xl):grid-cols-(\d+)/g)]
      .map((m) => Number(m[1]));
    expect(trackCounts).toContain(count);
    if (count === 3) {
      expect(grid.className).not.toContain("grid-cols-4");
    }
  };

  /** Tiles in the 6-track lg layout must fill both rows exactly. */
  const expectFiveTileSpans = (grid: HTMLElement) => {
    const spans = within(grid)
      .getAllByTestId("kpi-tile")
      .map((tile) => tile.className);
    expect(spans).toHaveLength(5);
    // first three share a row (2+2+2 = 6), last two share the next (3+3 = 6)
    expect(spans[0]).toContain("lg:col-span-2");
    expect(spans[1]).toContain("lg:col-span-2");
    expect(spans[2]).toContain("lg:col-span-2");
    expect(spans[3]).toContain("lg:col-span-3");
    expect(spans[4]).toContain("lg:col-span-3");
    // xl must reset every tile to a single track or the 5-across row breaks
    spans.forEach((s) => expect(s).toContain("xl:col-span-1"));
    // 2+2+2 and 3+3 both sum to the 6 lg tracks: no hole, no orphan.
    const lgTracks = (cls: string) => Number(cls.match(/lg:col-span-(\d)/)?.[1] ?? 0);
    const tracks = spans.map(lgTracks);
    expect(tracks.slice(0, 3).reduce((sum, n) => sum + n, 0)).toBe(6);
    expect(tracks.slice(3).reduce((sum, n) => sum + n, 0)).toBe(6);
  };

  it("renders the 4-tile Cuota Fija matrix into the reflowing grid", async () => {
    mockBothPeriods({}, {});

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expectReflowGrid(screen.getByTestId("kpi-strip-grid"), 4);
  });

  it("renders the 3-tile cost-gated matrix (MANAGER, no cost grant) with no orphaned column", async () => {
    mockBothPeriods({}, {});
    // permissions.ts fails closed: a MANAGER without a permissions array has
    // no cost grant, so the margin tile is omitted entirely (AC-17).
    useAuthStore.setState({
      user: {
        id: "user-2",
        email: "manager@test.ni",
        name: "Manager",
        role: "MANAGER",
        tenantId: "tenant-1",
        active: true,
      },
    });

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.queryByText("Margen Bruto")).not.toBeInTheDocument();
    // 3 tiles must not sit in a 4-track grid — that is the hole G3 removes.
    expectReflowGrid(screen.getByTestId("kpi-strip-grid"), 3);
  });

  it("renders the 5-tile Régimen General matrix balanced, with no orphaned tile", async () => {
    mockBothPeriods({}, {});
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "REGIMEN_GENERAL" });

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(5);
    });
    const grid = screen.getByTestId("kpi-strip-grid");
    expectReflowGrid(grid, 5);
    expectFiveTileSpans(grid);
  });

  it("keeps the skeleton on a reflowing grid that promises no unknown shape", () => {
    vi.mocked(fetchDashboardReport).mockReturnValue(new Promise(() => {}) as never);

    renderStrip();

    const skeleton = screen.getByTestId("kpi-strip-skeleton");
    expect(skeleton.className).toContain("grid");
    expect(skeleton.className).toContain("lg:grid-cols-4");
  });
});

describe("KpiStrip — fiscal pending hold (G4)", () => {
  it("holds the skeleton while the regime is pending, then settles once to the 5-tile matrix", async () => {
    // Both sales ranges and the fiscal setup are deferred so the test can
    // prove the ordering: sales settle first, the strip must NOT flash the
    // Cuota-Fija-shaped 4-tile matrix while the regime is still in flight.
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const salesCurrent = deferred<Record<string, unknown>>();
    const salesPrevious = deferred<Record<string, unknown>>();
    vi.mocked(fetchDashboardReport).mockImplementation(((start: string) =>
      start === CURRENT_RANGE.start ? salesCurrent.promise : salesPrevious.promise) as unknown as typeof fetchDashboardReport);
    const fiscal = deferred<{ regime: "REGIMEN_GENERAL" }>();
    vi.mocked(fetchFiscalSetup).mockImplementation((() => fiscal.promise) as typeof fetchFiscalSetup);

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-strip-skeleton")).toBeInTheDocument();
    });

    salesCurrent.resolve(salesPayload({}));
    salesPrevious.resolve(salesPayload({}));
    // Flush the sales query settlements across a macrotask so react-query
    // state has fully propagated; the strip must still hold the skeleton
    // instead of committing a wrong-shape matrix.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId("kpi-strip-skeleton")).toBeInTheDocument();
    expect(screen.queryAllByTestId("kpi-tile")).toHaveLength(0);

    fiscal.resolve({ regime: "REGIMEN_GENERAL" });

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(5);
    });
    expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
  });

  it("does not hang in the skeleton on fiscal failure: 4 tiles plus the warning", async () => {
    mockBothPeriods({}, {});
    vi.mocked(fetchFiscalSetup).mockRejectedValue(new Error("fiscal down"));

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expect(screen.getByTestId("fiscal-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — fiscal regime context label (G2, FR-FISCAL-03)", () => {
  // The page derives its range from the real clock (no `today` injection),
  // so the page-level sales mock accepts any range; the label tests only
  // exercise the fiscal profile path.
  const mockSalesAnyRange = () => {
    vi.mocked(fetchDashboardReport).mockResolvedValue(salesPayload({}) as never);
  };

  it("renders 'Régimen fiscal: Cuota Fija' sourced from the backend regime", async () => {
    mockSalesAnyRange();

    renderPage();

    expect(await screen.findByText(/Régimen fiscal: Cuota Fija/)).toBeInTheDocument();
  });

  it("renders 'Régimen fiscal: Régimen General' for the general regime", async () => {
    mockSalesAnyRange();
    vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "REGIMEN_GENERAL" });

    renderPage();

    expect(await screen.findByText(/Régimen fiscal: Régimen General/)).toBeInTheDocument();
  });

  it("shows no regime claim while the regime is still pending", async () => {
    mockSalesAnyRange();
    vi.mocked(fetchFiscalSetup).mockReturnValue(new Promise(() => {}) as never);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-strip-skeleton")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Régimen fiscal/)).not.toBeInTheDocument();
  });

  it("shows no regime claim when the regime fetch fails", async () => {
    mockSalesAnyRange();
    vi.mocked(fetchFiscalSetup).mockRejectedValue(new Error("fiscal down"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("fiscal-warning")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Régimen fiscal/)).not.toBeInTheDocument();
  });
});

describe("KpiStrip — values and formatting", () => {
  it("renders null averageTicketNetNio as em-dash", async () => {
    mockBothPeriods({ averageTicketNetNio: null }, { averageTicketNetNio: null });

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Ticket Promedio")?.textContent).toContain("—");
    });
  });

  it("renders an em-dash delta when the previous period is zero, never +100%", async () => {
    mockBothPeriods({}, ZERO_SALES);

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Ventas Netas")?.textContent).toContain("C$48,520.50");
    });
    expect(tileByLabel("Ventas Netas")?.textContent).toContain("Sin base comparable");
    expect(screen.queryByText(/\+100%/)).not.toBeInTheDocument();
  });

  it("shows delta arrows with the resolver-derived comparison label", async () => {
    mockBothPeriods(
      {},
      { netSalesNio: 43160.2, completedTicketCount: 150, averageTicketNetNio: 287.73 },
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText(/\+12\.4%/)).toBeInTheDocument();
    });
    expect(screen.getAllByText(COMPARISON_LABEL).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("↑").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the margin percentage with a percentage-point delta", async () => {
    mockBothPeriods(
      {},
      { netSalesNio: 43160.2, completedTicketCount: 150, averageTicketNetNio: 287.73 },
    );
    vi.mocked(fetchCogs).mockImplementation(((from: string) => {
      if (from === CURRENT_RANGE.start) return Promise.resolve(cogsPayload(18740));
      return Promise.resolve(cogsPayload(19422.09));
    }) as typeof fetchCogs);

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText("61.4%")).toBeInTheDocument();
    });
    expect(screen.getByText(/pp/)).toBeInTheDocument();
  });
});

describe("KpiStrip — Batch 7 additive tips payload (PRD §21)", () => {
  it("keeps the regime matrix intact when the report carries a tips summary", async () => {
    mockBothPeriods({}, {});

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    // Tips are a separate flow (PRD §21.3): no tips tile in the strip.
    expect(screen.queryByText("Total Propinas")).not.toBeInTheDocument();
  });

  it("normalizes the tips summary through normalizeDashboardReport without breaking legacy fields", () => {
    const report = normalizeDashboardReport(salesPayload({}));
    expect(report.netSalesNio).toBe(48520.5);
    expect(report.tipsSummary).toEqual({
      totalTipsNio: 130,
      tippedTicketCount: 2,
      averageTipNio: 65,
      tipRate: 8.13,
      tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
    });
  });
});

describe("KpiStrip — states (PRD §23)", () => {
  it("renders real zeros and 'sin actividad' instead of skeleton on zero sales", async () => {
    mockBothPeriods(ZERO_SALES, ZERO_SALES);
    // An empty period is COMPLETE with zero costable sales, not unknown.
    vi.mocked(fetchCogs).mockResolvedValue(
      cogsPayload(0, { status: "COMPLETE", costedSalesCount: 0, uncostedSalesCount: 0 }) as never,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText(/sin actividad/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("kpi-strip-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
  });

  it("renders a skeleton while the sales queries are loading", () => {
    vi.mocked(fetchDashboardReport).mockReturnValue(new Promise(() => {}) as never);

    renderStrip();

    expect(screen.getByTestId("kpi-strip-skeleton")).toBeInTheDocument();
  });

  it("isolates strip failure without killing sibling widgets", async () => {
    mockSalesFailure();

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-strip-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("sibling-widget")).toBeInTheDocument();
    expect(screen.getByText("Métodos de Pago")).toBeInTheDocument();
  });
});
