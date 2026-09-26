/**
 * Dashboard V2 Batch 6b — Attention Required band + AG-06 cost permission gate.
 *
 * Authorities:
 * - PRD v1.0 §19 (severity model), §24 (drill-down destinations),
 *   AC-10/AC-11/AC-12/AC-13 (attention signals), AC-17 (permission-limited
 *   Manager), FR-STATE-04/05 (partial failure isolation)
 * - Architecture spec v0.3 §15 (card reconciliation summary), §16 (audit
 *   summary), §18 (fiscal sequence audit), §22
 * - AG-06 gate finding: cost visibility must be gated client-side until the
 *   backend permission chain ships.
 *
 * Mock style follows the existing suite: the fetch layer is mocked while the
 * real normalization/hook logic runs under a real QueryClient.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttentionBand } from "@/features/dashboard/attention-band";
import { KpiStrip } from "@/features/dashboard/kpi-strip";
import {
  fetchAuditSummary,
  fetchCardReconciliationSummary,
} from "@/features/dashboard/dashboard-api";
import { fetchAlerts, fetchCogs } from "@/features/inventory/inventory-api";
import {
  fetchSequenceAudit,
  fetchVoidedInvoices,
} from "@/features/fiscal/fiscal-api";
import {
  fetchDashboardReport,
  fetchFiscalSetup,
} from "@/features/dashboard/dashboard-api";
import { useAuthStore } from "@/features/auth/auth-store";
import type { User, UserRole } from "@/types";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

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

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAuditSummary: vi.fn(),
  fetchCardReconciliationSummary: vi.fn(),
  fetchDashboardReport: vi.fn(),
  fetchFiscalSetup: vi.fn(),
}));

const RANGE = { start: "2026-09-23", end: "2026-09-23" };

// ---------------------------------------------------------------------------
// Wire payload helpers (post-normalization shapes)
// ---------------------------------------------------------------------------

const GENERATED_AT = "2026-09-23T21:54:00Z";

const alertsPayload = (overrides: Record<string, unknown> = {}) => ({
  totalAlertsCount: 0,
  criticalCount: 0,
  warningCount: 0,
  negativeCount: 0,
  generatedAt: GENERATED_AT,
  alerts: [],
  ...overrides,
});

const reconciliationPayload = (overrides: Record<string, unknown> = {}) => ({
  pendingCount: 0,
  pendingAmountNio: 0,
  oldestPendingAt: null,
  generatedAt: GENERATED_AT,
  ...overrides,
});

const voidsPayload = (overrides: Record<string, unknown> = {}) => ({
  totalVoidedCount: 0,
  totalVoidedAmount: 0,
  generatedAt: GENERATED_AT,
  invoices: [],
  ...overrides,
});

const sequencePayload = (overrides: Record<string, unknown> = {}) => ({
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

const auditPayload = (overrides: Record<string, unknown> = {}) => ({
  criticalCount: 0,
  warningCount: 0,
  infoCount: 0,
  latestHighSeverity: null,
  generatedAt: GENERATED_AT,
  ...overrides,
});

function mockAllAttention() {
  vi.mocked(fetchAlerts).mockResolvedValue(alertsPayload());
  vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
    reconciliationPayload(),
  );
  vi.mocked(fetchVoidedInvoices).mockResolvedValue(voidsPayload());
  vi.mocked(fetchSequenceAudit).mockResolvedValue(sequencePayload());
  vi.mocked(fetchAuditSummary).mockResolvedValue(auditPayload());
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderBand() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>
        <AttentionBand range={RANGE} />
      </QueryClientProvider>
    </MemoryRouter>,
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

function renderStrip() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KpiStrip range={RANGE} today="2026-09-23" />
    </QueryClientProvider>,
  );
}

// KPI strip fixtures mirror dashboard-v2-strip.spec.tsx so the margin math
// resolves to the same known 61.4% figure.
const salesPayload = () => ({
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
  reportingPeriod: null,
  generatedAt: GENERATED_AT,
});

const cogsPayload = () => ({
  fromDate: RANGE.start,
  toDate: RANGE.end,
  totalCogsNio: 18740,
  salesCogsNio: 18740,
  shrinkageCogsNio: 0,
  generatedAt: GENERATED_AT,
  items: [],
});

function mockSalesPipeline() {
  vi.mocked(fetchDashboardReport).mockResolvedValue(salesPayload() as never);
  vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
  vi.mocked(fetchCogs).mockResolvedValue(cogsPayload() as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    tenant: null,
    isAuthenticated: false,
    hydrated: true,
  });
  mockAllAttention();
});

// ---------------------------------------------------------------------------
// Attention Required band
// ---------------------------------------------------------------------------

describe("AttentionBand — all five signals (PRD §19.2/§19.3)", () => {
  it("renders every signal with its severity when alerts exist", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 3, warningCount: 2, totalAlertsCount: 5 }),
    );
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationPayload({ pendingCount: 3, pendingAmountNio: 840.5 }),
    );
    vi.mocked(fetchVoidedInvoices).mockResolvedValue(
      voidsPayload({ totalVoidedCount: 2, totalVoidedAmount: 840 }),
    );
    vi.mocked(fetchSequenceAudit).mockResolvedValue(
      sequencePayload({
        hasGaps: true,
        missingSequences: [4],
        actualCount: 9,
        expectedCount: 10,
      }),
    );
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditPayload({ criticalCount: 2, warningCount: 1 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-vouchers")).toBeInTheDocument();
    expect(screen.getByTestId("attention-item-voids")).toBeInTheDocument();
    expect(screen.getByTestId("attention-item-sequence")).toBeInTheDocument();
    expect(screen.getByTestId("attention-item-audit")).toBeInTheDocument();

    // Severity model per PRD §19.1.
    expect(screen.getByTestId("attention-item-stock")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(screen.getByTestId("attention-item-vouchers")).toHaveAttribute(
      "data-severity",
      "warning",
    );
    expect(screen.getByTestId("attention-item-voids")).toHaveAttribute(
      "data-severity",
      "warning",
    );
    expect(screen.getByTestId("attention-item-sequence")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(screen.getByTestId("attention-item-audit")).toHaveAttribute(
      "data-severity",
      "critical",
    );

    // Glyphs: ● Critical / ▲ Warning / ✓ Info.
    expect(screen.getByTestId("attention-item-stock").textContent).toContain("●");
    expect(screen.getByTestId("attention-item-vouchers").textContent).toContain("▲");
    expect(screen.getByTestId("attention-item-voids").textContent).toContain("▲");
    expect(screen.getByTestId("attention-item-sequence").textContent).toContain("●");
    expect(screen.getByTestId("attention-item-audit").textContent).toContain("●");

    // Healthy banner must never coexist with critical/warning rows.
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
  });

  it("renders signal details (counts and amounts)", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 3, totalAlertsCount: 3 }),
    );
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationPayload({ pendingCount: 3, pendingAmountNio: 840.5 }),
    );
    vi.mocked(fetchVoidedInvoices).mockResolvedValue(
      voidsPayload({ totalVoidedCount: 2, totalVoidedAmount: 840 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock").textContent).toContain(
        "3 producto",
      );
    });
    expect(screen.getByTestId("attention-item-vouchers").textContent).toContain(
      "3 voucher",
    );
    expect(screen.getByTestId("attention-item-vouchers").textContent).toContain(
      "C$840.50",
    );
    expect(screen.getByTestId("attention-item-voids").textContent).toContain(
      "2 anulacion",
    );
    expect(screen.getByTestId("attention-item-voids").textContent).toContain(
      "C$840.00",
    );
  });
});

describe("AttentionBand — severity rendering (PRD §19.1)", () => {
  it("renders Info severity with the ✓ glyph", async () => {
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditPayload({ infoCount: 4 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-audit")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-audit")).toHaveAttribute(
      "data-severity",
      "info",
    );
    expect(screen.getByTestId("attention-item-audit").textContent).toContain("✓");
    expect(screen.getByTestId("attention-item-audit").textContent).toContain("4");
  });

  it("renders a healthy fiscal sequence as Info ('sin gaps')", async () => {
    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-sequence")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-sequence")).toHaveAttribute(
      "data-severity",
      "info",
    );
    expect(screen.getByTestId("attention-item-sequence").textContent).toContain(
      "Secuencia fiscal sin gaps",
    );
  });
});

describe("AttentionBand — healthy state (PRD §19)", () => {
  it("shows 'Todo en orden' when no critical or warning alerts exist", async () => {
    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-healthy")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-healthy").textContent).toContain(
      "Todo en orden",
    );
    expect(screen.queryByTestId("attention-item-stock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-vouchers")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-voids")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-audit")).not.toBeInTheDocument();
  });

  it("hides the healthy banner while any signal is still loading", async () => {
    vi.mocked(fetchAuditSummary).mockReturnValue(new Promise(() => {}));

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-loading")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
  });
});

describe("AttentionBand — drill-down destinations (PRD §24)", () => {
  it("links every signal to its drill-down destination", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 1, totalAlertsCount: 1 }),
    );
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationPayload({ pendingCount: 2, pendingAmountNio: 500 }),
    );
    vi.mocked(fetchVoidedInvoices).mockResolvedValue(
      voidsPayload({ totalVoidedCount: 1, totalVoidedAmount: 100 }),
    );
    vi.mocked(fetchSequenceAudit).mockResolvedValue(
      sequencePayload({ hasGaps: true, missingSequences: [7] }),
    );
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditPayload({ criticalCount: 1 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-link-stock")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-link-stock")).toHaveAttribute(
      "href",
      "/inventory",
    );
    expect(screen.getByTestId("attention-link-vouchers")).toHaveAttribute(
      "href",
      "/sales",
    );
    expect(screen.getByTestId("attention-link-voids")).toHaveAttribute(
      "href",
      "/fiscal",
    );
    expect(screen.getByTestId("attention-link-sequence")).toHaveAttribute(
      "href",
      "/fiscal",
    );
    expect(screen.getByTestId("attention-link-audit")).toHaveAttribute(
      "href",
      "/audit",
    );
  });
});

describe("AttentionBand — partial failure isolation (FR-STATE-04/05)", () => {
  it("degrades the failed signal without breaking the rest of the section", async () => {
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationPayload({ pendingCount: 2, pendingAmountNio: 500 }),
    );
    vi.mocked(fetchSequenceAudit).mockRejectedValue(new Error("fiscal down"));

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-error-sequence")).toBeInTheDocument();
    });
    // The healthy signal still renders its row.
    expect(screen.getByTestId("attention-item-vouchers")).toBeInTheDocument();
    // The failed signal must not claim health or block the section.
    expect(screen.queryByTestId("attention-item-sequence")).not.toBeInTheDocument();
    expect(screen.getByTestId("attention-band")).toBeInTheDocument();
  });

  it("suppresses the healthy banner when a signal failed (cannot assert order)", async () => {
    vi.mocked(fetchVoidedInvoices).mockRejectedValue(new Error("voids down"));

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-error-voids")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AG-06 — cost permission gating on the KPI strip (PRD AC-17)
// ---------------------------------------------------------------------------

describe("KpiStrip — AG-06 cost permission gating (AC-17)", () => {
  it("OWNER sees the Margen Bruto tile with margin figures", async () => {
    setAuthUser("OWNER");
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText("61.4%")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    const margin = screen
      .getAllByTestId("kpi-tile")
      .find((el) => el.textContent?.includes("Margen Bruto"));
    expect(margin).toBeDefined();
    expect(margin?.textContent).toContain("61.4%");
    expect(margin?.textContent).toContain("C$29,780.50");
    expect(fetchCogs).toHaveBeenCalled();
  });

  it("MANAGER without INVENTORY_COST_VIEW sees no cost/margin numbers and COGS is never fetched", async () => {
    setAuthUser("MANAGER");
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.queryByText("Margen Bruto")).not.toBeInTheDocument();
    expect(screen.queryByText("61.4%")).not.toBeInTheDocument();
    expect(screen.queryByText("C$18,740.00")).not.toBeInTheDocument();
    // No sensitive numeric fetch is fired at all.
    expect(fetchCogs).not.toHaveBeenCalled();
  });

  it("MANAGER with the INVENTORY_COST_VIEW grant sees the Margen Bruto tile", async () => {
    setAuthUser("MANAGER", ["inventory:cost_view"]);
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getByText("61.4%")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    const margin = screen
      .getAllByTestId("kpi-tile")
      .find((el) => el.textContent?.includes("Margen Bruto"));
    expect(margin?.textContent).toContain("61.4%");
  });

  it("MANAGER with the backend-style INVENTORY_COST_VIEW grant also passes the gate", async () => {
    setAuthUser("MANAGER", ["INVENTORY_COST_VIEW"]);
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
    });
    expect(screen.getByText("Margen Bruto")).toBeInTheDocument();
  });

  it("keeps a consistent 4-column layout without the margin tile", async () => {
    setAuthUser("MANAGER");
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    // The grid container keeps its column template (no layout breakage).
    const tiles = screen.getAllByTestId("kpi-tile");
    const firstTile = tiles.find(() => true);
    expect(firstTile).toBeDefined();
    expect(firstTile?.parentElement?.className).toContain("lg:grid-cols-4");
  });
});
