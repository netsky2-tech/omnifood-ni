/**
 * Dashboard V2 — Review round 2, WU5: management band rework.
 *
 * Authorities:
 * - docs/dashboard/ui_wireframe_reference.md §1 rows "RENTABILIDAD — Margen
 *   Bruto" (management band) and "FLUJOS SEPARADOS DE VENTAS"; §3 change #6;
 *   §4 gating notes; §5 invariants.
 * - PRD §13 FR-DISC-02 (discount denominator = approved Pre-discount Sales).
 * - dashboard-types.ts MarginGate contract (review round 2 P0 #4): the ratio
 *   only on COMPLETE coverage, the amount only on COMPLETE/PARTIAL, never a
 *   fabricated zero.
 * - AG-06 / AC-17: the Rentabilidad card is omitted entirely without the
 *   cost grant — no placeholder, no cost numerics in the DOM, band reflows.
 *
 * Mock style follows the existing suite: fetch layers are mocked while the
 * real normalization/hook logic runs under a real QueryClient.
 */
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { RentabilidadCard } from "@/features/dashboard/rentabilidad-card";
import { TipsSummaryCard } from "@/features/dashboard/tips-summary";
import { useDashboardKpis } from "@/features/dashboard/use-dashboard-kpis";
import { useSalesDashboard } from "@/features/sales/use-sales-reports";
import { fetchCogs } from "@/features/inventory/inventory-api";
import { fetchDashboardReport } from "@/features/dashboard/dashboard-api";
import { useCanViewInventoryCost } from "@/features/auth/permissions";
import type { MarginGate } from "@/features/dashboard/dashboard-types";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/use-sync-freshness", () => ({
  useSyncFreshness: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

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

vi.mock("@/features/auth/permissions", () => ({
  INVENTORY_COST_VIEW: "inventory:cost_view",
  canViewInventoryCost: vi.fn(() => true),
  useCanViewInventoryCost: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const SNAPSHOT = {
  netSalesNio: 48520.5,
  completedTicketCount: 171,
  averageTicketNetNio: 283.74,
  totalTaxNio: 6341.25,
  totalDiscountsNio: 1420,
  margin: { amount: 29780.5, percent: 61.4 },
  tipsSummary: null,
  deltas: {
    netSales: 12.4,
    tickets: 8.2,
    averageTicket: 3.8,
    marginPp: 1.9,
    totalTax: 9.1,
  },
};

const COMPLETE_GATE: MarginGate = {
  ratio: true,
  delta: true,
  amount: true,
  gated: false,
  reasonCodes: [],
};

const UNAVAILABLE_GATE: MarginGate = {
  ratio: false,
  delta: false,
  amount: false,
  gated: true,
  reasonCodes: ["UNRESOLVED_SOURCE_DOCUMENT"],
};

const COGS_NOT_LOADED_GATE: MarginGate = {
  ratio: false,
  delta: false,
  amount: false,
  gated: false,
  reasonCodes: [],
};

function mockKpis(overrides: Record<string, unknown> = {}) {
  vi.mocked(useDashboardKpis).mockReturnValue({
    period: {
      currentStart: "2026-08-31",
      currentEnd: "2026-08-31",
      previousStart: "2026-08-24",
      previousEnd: "2026-08-24",
    },
    snapshot: SNAPSHOT,
    isSalesPending: false,
    isSalesFailed: false,
    fiscal: { regime: "CUOTA_FIJA" },
    isFiscalFailed: false,
    isFiscalPending: false,
    isCogsFailed: false,
    marginGate: COMPLETE_GATE,
    ...overrides,
  } as never);
}

function mockSalesPage() {
  vi.mocked(useSalesDashboard).mockReturnValue({
    data: {
      grossSales: 15000.5,
      netTaxableSales: 13043.91,
      totalTax: 1956.59,
      totalDiscounts: 500,
      invoiceCount: 42,
      ticketAverage: 357.15,
      startDate: "2026-08-31",
      endDate: "2026-08-31",
      generatedAt: "2026-08-31T15:30:00Z",
    },
    isLoading: false,
    error: null,
  } as never);
}

function mockV2Report() {
  // Raw wire for GET /sales/reports/dashboard (normalized by the real
  // fetchDashboardReport): supplies the FR-DISC-02 pre-discount base.
  vi.mocked(fetchDashboardReport).mockResolvedValue({
    grossSales: 50000,
    netTaxableSales: 43600,
    totalTax: 0,
    totalDiscounts: 1420,
    invoiceCount: 171,
    ticketAverage: 283.74,
    netSalesNio: 48520.5,
    preDiscountSalesNio: 49940.5,
    completedTicketCount: 171,
    averageTicketNetNio: 283.74,
    totalTaxNio: 0,
    totalDiscountsNio: 1420,
    tipsSummary: null,
    reportingPeriod: null,
    generatedAt: "2026-08-31T15:30:00Z",
  } as never);
}

function mockCogs(overrides: Record<string, unknown> = {}) {
  vi.mocked(fetchCogs).mockResolvedValue({
    fromDate: "2026-08-31",
    toDate: "2026-08-31",
    totalCogsNio: 19660,
    salesCogsNio: 18740,
    shrinkageCogsNio: 920,
    generatedAt: "2026-08-31T15:30:00Z",
    items: [],
    inventoryCoverage: { status: "COMPLETE", costedSalesCount: 171, uncostedSalesCount: 0 },
    ...overrides,
  } as never);
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderCard(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RentabilidadCard — management band (wireframe §1:40–45)", () => {
  it("OWNER with the cost grant: renders the breakdown rows with the mermas caption and the gated percent", async () => {
    vi.mocked(useCanViewInventoryCost).mockReturnValue(true);
    mockKpis();
    mockSalesPage();
    mockV2Report();
    mockCogs();
    renderPage();

    expect(await screen.findByText("RENTABILIDAD — Margen Bruto")).toBeInTheDocument();
    // Card-scoped: the strip legitimately repeats net sales on its own tile.
    const card = within(screen.getByTestId("rentabilidad-card"));
    expect(card.getByText("Ventas netas")).toBeInTheDocument();
    expect(card.getByText("C$48,520.50")).toBeInTheDocument();
    // COGS-derived rows resolve with the (deduped) COGS read.
    expect(await card.findByText("Costo de ventas")).toBeInTheDocument();
    expect(card.getByText("C$18,740.00")).toBeInTheDocument();
    // Margin amount + percent (COMPLETE coverage → ratio is probable).
    expect(card.getByText("Margen bruto")).toBeInTheDocument();
    expect(card.getByText("C$29,780.50")).toBeInTheDocument();
    expect(card.getByText(/61\.4%/)).toBeInTheDocument();
    // Mermas row with the wireframe caption.
    expect(card.getByText("C$920.00")).toBeInTheDocument();
    expect(card.getByText("no reduce el margen mostrado")).toBeInTheDocument();
  });

  it("MANAGER without the cost grant: card omitted entirely, zero cost numerics, single-column band", () => {
    vi.mocked(useCanViewInventoryCost).mockReturnValue(false);
    mockKpis();
    mockSalesPage();
    mockV2Report();
    mockCogs();
    renderPage();

    expect(screen.queryByText("RENTABILIDAD — Margen Bruto")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo de ventas")).not.toBeInTheDocument();
    expect(screen.queryByText("C$18,740.00")).not.toBeInTheDocument();
    expect(screen.queryByText("C$920.00")).not.toBeInTheDocument();
    // AC-17: the gated fetch is never fired for a cost-blind user.
    expect(fetchCogs).not.toHaveBeenCalled();
    // The band reflows to one column — no hole.
    const band = screen.getByTestId("management-band");
    expect(band.className).toContain("grid-cols-1");
    expect(band.className).not.toContain("lg:grid-cols-2");
  });

  it("COGS coverage UNAVAILABLE: no fabricated zero, degraded rows, explicit unavailable note", async () => {
    mockKpis({ marginGate: UNAVAILABLE_GATE });
    mockCogs();
    renderCard(
      <RentabilidadCard
        canViewCost
        range={{ start: "2026-08-31", end: "2026-08-31" }}
        netSalesNio={48520.5}
        margin={SNAPSHOT.margin}
        marginGate={UNAVAILABLE_GATE}
      />,
    );

    expect(await screen.findByText("RENTABILIDAD — Margen Bruto")).toBeInTheDocument();
    // The wire carries 18740 but the gate says it is not provable — never printed.
    expect(screen.queryByText("C$18,740.00")).not.toBeInTheDocument();
    expect(screen.queryByText("C$0.00")).not.toBeInTheDocument();
    expect(screen.getByText("Costo de ventas no disponible")).toBeInTheDocument();
    // Ventas netas stays provable.
    expect(screen.getByText("C$48,520.50")).toBeInTheDocument();
  });

  it("COGS read model not loaded: degraded rows without fabricated zeros and without the unavailable note", async () => {
    renderCard(
      <RentabilidadCard
        canViewCost
        range={{ start: "2026-08-31", end: "2026-08-31" }}
        netSalesNio={48520.5}
        margin={null}
        marginGate={COGS_NOT_LOADED_GATE}
      />,
    );

    expect(await screen.findByText("RENTABILIDAD — Margen Bruto")).toBeInTheDocument();
    expect(screen.queryByText("C$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo de ventas no disponible")).not.toBeInTheDocument();
    expect(screen.getByText("C$48,520.50")).toBeInTheDocument();
  });
});

describe("Legacy Resumen de Ventas retirement", () => {
  it("renders nowhere on the dashboard (owner round-2 P2: fully redundant)", () => {
    vi.mocked(useCanViewInventoryCost).mockReturnValue(true);
    mockKpis();
    mockSalesPage();
    mockV2Report();
    mockCogs();
    renderPage();

    expect(screen.queryByText("Resumen de Ventas")).not.toBeInTheDocument();
    expect(screen.queryByText("Ventas Brutas")).not.toBeInTheDocument();
    expect(screen.queryByText("Ventas Netas Gravables")).not.toBeInTheDocument();
  });
});

describe("Flujos separados de ventas (wireframe §1:41–47)", () => {
  it("Descuentos always visible with the rate over the FR-DISC-02 pre-discount base", () => {
    renderCard(
      <TipsSummaryCard
        summary={null}
        totalDiscountsNio={1420}
        preDiscountSalesNio={49940.5}
      />,
    );

    expect(screen.getByTestId("tips-summary-card")).toBeInTheDocument();
    expect(screen.getByText("Descuentos")).toBeInTheDocument();
    expect(screen.getByText("C$1,420.00")).toBeInTheDocument();
    expect(screen.getByText(/2\.8% base/)).toBeInTheDocument();
    // Tips inapplicable → the tips rows stay omitted (PRD §21.4), but the
    // flows card itself remains for Descuentos.
    expect(screen.queryByText("Total Propinas")).not.toBeInTheDocument();
  });

  it("no pre-discount base: the rate degrades to an em-dash, never a fabricated percent", () => {
    renderCard(
      <TipsSummaryCard summary={null} totalDiscountsNio={1420} />,
    );

    expect(screen.getByText("C$1,420.00")).toBeInTheDocument();
    expect(screen.queryByText(/2\.8% base/)).not.toBeInTheDocument();
  });

  it("tips applicable: tip rows intact with the not-part-of-sales note", () => {
    renderCard(
      <TipsSummaryCard
        summary={{
          totalTipsNio: 130,
          tippedTicketCount: 2,
          averageTipNio: 65,
          tipRate: 8.13,
          tipCoverage: { recordedInvoicesCount: 3, totalInvoicesCount: 4 },
        }}
        totalDiscountsNio={1420}
        preDiscountSalesNio={49940.5}
      />,
    );

    expect(screen.getByText("Total Propinas")).toBeInTheDocument();
    expect(screen.getByText("C$130.00")).toBeInTheDocument();
    expect(screen.getByText("8.1%")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    // §21.3 separation of flows is stated, not implied.
    expect(screen.getByText(/No incluidas en ventas/)).toBeInTheDocument();
  });
});

describe("RentabilidadCard — PARTIAL coverage honesty (finding D1)", () => {
  const PARTIAL_GATE: MarginGate = {
    ratio: false,
    delta: false,
    amount: true,
    gated: true,
    reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING"],
  };

  it("PARTIAL keeps the amounts but states the margin is not the whole period", async () => {
    mockKpis({ marginGate: PARTIAL_GATE });
    mockCogs();
    renderCard(
      <RentabilidadCard
        canViewCost
        range={{ start: "2026-08-31", end: "2026-08-31" }}
        netSalesNio={48520.5}
        margin={SNAPSHOT.margin}
        marginGate={PARTIAL_GATE}
      />,
    );

    expect(await screen.findByText("C$18,740.00")).toBeInTheDocument();
    // A PARTIAL margin is real but incomplete: it must never read as a
    // finished measurement of the period.
    expect(
      screen.getByText(/Costo de ventas incompleto: parte del período no tiene costo registrado/i),
    ).toBeInTheDocument();
    // Refuted claim, pinned: no direction may be asserted. A canceled invoice
    // without its SALE_CANCEL reversal moves this figure the opposite way from
    // an uncosted sale, and that reversal invariant is not proven.
    const card = screen.getByTestId("rentabilidad-card").textContent ?? "";
    expect(card).not.toMatch(/mayor que el real|menor que el real|límite (superior|inferior)/);
    expect(
      screen.getByText(/Mapea los insumos del producto/i),
    ).toBeInTheDocument();
    // The unavailable-only copy must not appear when amounts do render.
    expect(screen.queryByText("Costo de ventas no disponible")).not.toBeInTheDocument();
  });
});
