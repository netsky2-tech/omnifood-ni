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
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KpiStrip, type KpiStripProps } from "@/features/dashboard/kpi-strip";
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

const cogsPayload = (salesCogsNio: number) => ({
  fromDate: CURRENT_RANGE.start,
  toDate: CURRENT_RANGE.end,
  totalCogsNio: salesCogsNio,
  salesCogsNio,
  shrinkageCogsNio: 0,
  generatedAt: "2026-09-23T21:54:00Z",
  items: [],
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

describe("KpiStrip — states (PRD §23)", () => {
  it("renders real zeros and 'sin actividad' instead of skeleton on zero sales", async () => {
    mockBothPeriods(ZERO_SALES, ZERO_SALES);
    vi.mocked(fetchCogs).mockResolvedValue(cogsPayload(0) as never);

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
