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
  manualOverrideCount: 0,
  manualOverrideAmountNio: 0,
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
  // WU3's margin gate reads coverage, not the COGS amount: without an
  // explicit COMPLETE the ratio legitimately renders "—", which is the correct
  // behaviour but not what these AC-17 margin-figure tests are about.
  inventoryCoverage: { status: "COMPLETE", costedSalesCount: 12, uncostedSalesCount: 0 },
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

    // Temporal scope chips: stock and vouchers are current-state signals
    // (outstanding snapshots, not date-filtered); voids, the sequence gap
    // check, and the audit summary are scoped to the selected page range.
    expect(screen.getByTestId("attention-scope-stock").textContent).toBe("Actual");
    expect(screen.getByTestId("attention-scope-vouchers").textContent).toBe("Actual");
    expect(screen.getByTestId("attention-scope-voids").textContent).toBe("Período");
    expect(screen.getByTestId("attention-scope-sequence").textContent).toBe("Período");
    expect(screen.getByTestId("attention-scope-audit").textContent).toBe("Período");
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

describe("AttentionBand — exceptions-only scope (PRD §19, AC-11)", () => {
  it("renders no row for a healthy fiscal sequence (AC-11 is conditional on hasGaps = true)", async () => {
    // One unrelated exception keeps the panel mounted so the absence of the
    // sequence row is observed against a settled, rendered panel.
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 1, totalAlertsCount: 1 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-item-sequence")).not.toBeInTheDocument();
  });

  it("renders no row for an info-only audit summary (info-only is not actionable)", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 1, totalAlertsCount: 1 }),
    );
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditPayload({ infoCount: 11 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-stock")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-item-audit")).not.toBeInTheDocument();
  });

  it("renders no row when the audit has only warning-free info events (critical/warning still surface)", async () => {
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 1, totalAlertsCount: 1 }),
    );
    vi.mocked(fetchAuditSummary).mockResolvedValue(
      auditPayload({ warningCount: 1, infoCount: 11 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-audit")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-audit")).toHaveAttribute(
      "data-severity",
      "warning",
    );
  });
});

describe("AttentionBand — zero exceptions hides the panel (PRD §19)", () => {
  it("renders nothing when every ready signal is healthy (no 'todo bien' card)", async () => {
    renderBand();

    await waitFor(() => {
      expect(screen.queryByTestId("attention-band")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-item-stock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-vouchers")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-voids")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-sequence")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-item-audit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
  });

  it("keeps the panel (loading skeleton) while any signal is still pending", async () => {
    vi.mocked(fetchAuditSummary).mockReturnValue(new Promise(() => {}));

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-loading")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-band")).toBeInTheDocument();
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
    expect(
      screen.getByTestId("attention-link-stock").getAttribute("href"),
    ).toContain("/inventory?source=dashboard&sourceWidget=attention");
    expect(
      screen.getByTestId("attention-link-stock").getAttribute("href"),
    ).toContain("tab=alerts");
    expect(screen.getByTestId("attention-link-stock")).toHaveTextContent(
      "Ver productos →",
    );

    expect(
      screen.getByTestId("attention-link-vouchers").getAttribute("href"),
    ).toContain("/sales?source=dashboard&sourceWidget=attention");
    expect(screen.getByTestId("attention-link-vouchers")).toHaveTextContent(
      "Revisar vouchers →",
    );

    expect(
      screen.getByTestId("attention-link-voids").getAttribute("href"),
    ).toContain("/fiscal?source=dashboard&sourceWidget=attention");
    expect(
      screen.getByTestId("attention-link-voids").getAttribute("href"),
    ).toContain("tab=voided");
    expect(screen.getByTestId("attention-link-voids")).toHaveTextContent(
      "Ver anulaciones →",
    );

    expect(
      screen.getByTestId("attention-link-sequence").getAttribute("href"),
    ).toContain("/fiscal?source=dashboard&sourceWidget=attention");
    expect(
      screen.getByTestId("attention-link-sequence").getAttribute("href"),
    ).toContain("tab=sequence");
    expect(screen.getByTestId("attention-link-sequence")).toHaveTextContent(
      "Revisar secuencia →",
    );

    expect(
      screen.getByTestId("attention-link-audit").getAttribute("href"),
    ).toContain("/audit?source=dashboard&sourceWidget=attention");
    expect(screen.getByTestId("attention-link-audit")).toHaveTextContent(
      "Ver auditoría →",
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

  it("still renders the panel (error rows, not a blank) when every ready signal is healthy but one failed", async () => {
    vi.mocked(fetchVoidedInvoices).mockRejectedValue(new Error("voids down"));

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-error-voids")).toBeInTheDocument();
    });
    // All ready signals are healthy (no items), but the panel must NOT blank:
    // a failed signal can never be presented as "healthy" (FR-STATE-04/05).
    expect(screen.getByTestId("attention-band")).toBeInTheDocument();
    expect(screen.queryByTestId("attention-healthy")).not.toBeInTheDocument();
  });
});

describe("AttentionBand — reconciliations drill-down (§9.2/§9.3 dead-end fix)", () => {
  it("drills pending vouchers to the reconciliations tab with the pending filter, not the card sales summary", async () => {
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue(
      reconciliationPayload({ pendingCount: 2, pendingAmountNio: 500 }),
    );

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-link-vouchers")).toBeInTheDocument();
    });
    const href =
      screen.getByTestId("attention-link-vouchers").getAttribute("href") ?? "";
    // Context-rich destination: the tab that actually lists pending vouchers
    // with its filter consumed by the destination (§9.3), not the card SALES
    // summary that shows no vouchers at all (the old dead end).
    expect(href).toContain("tab=reconciliations");
    expect(href).toContain("reconciliationStatus=PENDIENTE");
    expect(href).not.toContain("tab=summary");
    expect(href).toContain("source=dashboard&sourceWidget=attention");
  });

  it("renders a manual-overrides signal (info) when manualOverrideCount > 0", async () => {
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue({
      ...reconciliationPayload({ pendingCount: 0, pendingAmountNio: 0 }),
      manualOverrideCount: 2,
      manualOverrideAmountNio: 310,
    });

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-overrides")).toBeInTheDocument();
    });
    expect(screen.getByTestId("attention-item-overrides")).toHaveAttribute(
      "data-severity",
      "info",
    );
    expect(screen.getByTestId("attention-item-overrides").textContent).toContain(
      "2 override",
    );
    expect(screen.getByTestId("attention-item-overrides").textContent).toContain(
      "C$310.00",
    );
    const href =
      screen.getByTestId("attention-link-overrides").getAttribute("href") ?? "";
    expect(href).toContain("tab=reconciliations");
    expect(href).toContain("reconciliationStatus=MANUAL_OVERRIDE");
    expect(href).not.toContain("tab=summary");
  });

  it("renders no overrides row when manualOverrideCount is 0 (exceptions-only, no noise row)", async () => {
    // One unrelated exception keeps the panel mounted so the absence is
    // observed against a settled, rendered panel.
    vi.mocked(fetchAlerts).mockResolvedValue(
      alertsPayload({ criticalCount: 1, totalAlertsCount: 1 }),
    );
    vi.mocked(fetchCardReconciliationSummary).mockResolvedValue({
      ...reconciliationPayload({ pendingCount: 2, pendingAmountNio: 500 }),
      manualOverrideCount: 0,
      manualOverrideAmountNio: 0,
    });

    renderBand();

    await waitFor(() => {
      expect(screen.getByTestId("attention-item-vouchers")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("attention-item-overrides")).not.toBeInTheDocument();
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

  it("reflows the grid when the margin tile is gated out", async () => {
    setAuthUser("MANAGER");
    mockSalesPipeline();

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.getByText("Ventas Netas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    // The container reflows to the actual tile count instead of keeping a
    // fixed 4-track grid, which used to strand an empty column here (G3).
    const grid = screen.getByTestId("kpi-strip-grid");
    expect(grid.className).toContain("sm:grid-cols-3");
    expect(grid.className).not.toContain("lg:grid-cols-4");
  });
});
