/**
 * Dashboard V2 — Margen Bruto coverage gate (review round 2, P0 #4).
 *
 * Defect: the strip derived the margin ratio from `salesCogsNio` alone, so a
 * tenant with COGS data but no APPLIED insumo movements rendered
 * "Margen Bruto 100.0%" with a fabricated delta (the owner's headline
 * complaint). After WU11 flipped the coverage policy, the hidden-margin path
 * is the COMMON path: any tenant selling a product without insumo mapping is
 * PARTIAL or UNAVAILABLE.
 *
 * Contract under test:
 * - The RATIO (percent + pp delta) renders ONLY on
 *   `inventoryCoverage.status === "COMPLETE"`; any other status, a missing
 *   status or absent coverage fails closed to "—". A zero denominator is
 *   never fabricated into a percentage.
 * - The AMOUNT (C$ = netSales − salesCogsNio) renders on COMPLETE and
 *   PARTIAL (cost evidence exists for the costed part), and hides on
 *   UNAVAILABLE/unknown: the backend contract does not prove salesCogsNio
 *   authoritative there (it sums every SALE movement in the window,
 *   including ones the coverage counter cannot attribute).
 * - The "Sin costo" note is keyed to `reasonCodes` in backend emission
 *   order and never renders a raw reason-code string.
 * - AC-17 is unchanged: no cost grant → tile omitted entirely, no note.
 */
import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KpiStrip } from "@/features/dashboard/kpi-strip";
import {
  fetchCogs,
  type CogsReportWithCoverage,
} from "@/features/inventory/inventory-api";
import type { InventoryCoverage } from "@/features/inventory/inventory-types";
import { evaluateMarginGate } from "@/features/dashboard/dashboard-types";
import {
  fetchDashboardReport,
  fetchFiscalSetup,
  type DashboardV2Report,
} from "@/features/dashboard/dashboard-api";
import { useAuthStore } from "@/features/auth/auth-store";
import type { User, UserRole } from "@/types";

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

const DAY = "2026-09-23";
const PREV_DAY = "2026-09-22";
const GENERATED_AT = "2026-09-23T21:54:00Z";

/** Margin 29,780.50 / 48,520.50 = 61.4% (AC-06 fixture). */
const SALES_CURRENT = {
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
  tipsSummary: null,
  reportingPeriod: {
    timezone: "America/Managua",
    localStartDate: DAY,
    localEndDate: DAY,
  },
  generatedAt: GENERATED_AT,
};

/** Margin 23,738.11 / 43,160.20 = 55.0% -> pp delta vs current = +6.4 pp. */
const SALES_PREVIOUS = {
  ...SALES_CURRENT,
  netSalesNio: 43160.2,
  preDiscountSalesNio: 43160.2,
  completedTicketCount: 150,
  averageTicketNetNio: 287.73,
  reportingPeriod: {
    timezone: "America/Managua",
    localStartDate: PREV_DAY,
    localEndDate: PREV_DAY,
  },
};

const COMPLETE_CURRENT: InventoryCoverage = {
  status: "COMPLETE",
  costedSalesCount: 171,
  uncostedSalesCount: 0,
  reasonCodes: [],
};
const COMPLETE_PREVIOUS: InventoryCoverage = {
  status: "COMPLETE",
  costedSalesCount: 150,
  uncostedSalesCount: 0,
  reasonCodes: [],
};

function cogsFixture(
  salesCogsNio: number,
  coverage: InventoryCoverage | Record<string, unknown> | null,
  from: string,
): CogsReportWithCoverage {
  return {
    fromDate: from,
    toDate: from,
    totalCogsNio: salesCogsNio,
    salesCogsNio,
    shrinkageCogsNio: 0,
    // Key omitted entirely = the backend did not send coverage (fail closed).
    ...(coverage !== null ? { inventoryCoverage: coverage } : {}),
    generatedAt: GENERATED_AT,
    items: [],
  } as CogsReportWithCoverage;
}

function mockCogs(
  currentSalesCogs: number,
  currentCoverage: InventoryCoverage | Record<string, unknown> | null,
  previousSalesCogs: number,
  previousCoverage: InventoryCoverage | Record<string, unknown> | null,
) {
  vi.mocked(fetchDashboardReport).mockImplementation(((start: string) =>
    Promise.resolve(
      start === DAY
        ? (SALES_CURRENT as unknown as DashboardV2Report)
        : (SALES_PREVIOUS as unknown as DashboardV2Report),
    )) as typeof fetchDashboardReport);
  vi.mocked(fetchCogs).mockImplementation(((from: string) =>
    Promise.resolve(
      from === DAY
        ? cogsFixture(currentSalesCogs, currentCoverage, from)
        : cogsFixture(previousSalesCogs, previousCoverage, from),
    )) as typeof fetchCogs);
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

function renderStrip(props: Partial<ComponentProps<typeof KpiStrip>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>
        <KpiStrip range={{ start: DAY, end: DAY }} today={DAY} {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function tileByLabel(label: string): HTMLElement | undefined {
  return screen
    .getAllByTestId("kpi-tile")
    .find((el) => el.textContent?.includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: authUser("OWNER"),
    tenant: { id: "tenant-1", name: "Test", slug: "test", ruc: "", active: true },
    isAuthenticated: true,
    hydrated: true,
  });
  vi.mocked(fetchFiscalSetup).mockResolvedValue({ regime: "CUOTA_FIJA" });
});

// ---------------------------------------------------------------------------
// Pure gate matrix
// ---------------------------------------------------------------------------

describe("evaluateMarginGate — coverage trust matrix", () => {
  it("opens fully only on COMPLETE current coverage with COMPLETE previous", () => {
    const gate = evaluateMarginGate({
      isCogsLoaded: true,
      current: COMPLETE_CURRENT,
      previous: COMPLETE_PREVIOUS,
    });
    expect(gate.ratio).toBe(true);
    expect(gate.delta).toBe(true);
    expect(gate.amount).toBe(true);
    expect(gate.gated).toBe(false);
  });

  it("suppresses the pp delta when the previous period is not COMPLETE", () => {
    const gate = evaluateMarginGate({
      isCogsLoaded: true,
      current: COMPLETE_CURRENT,
      previous: {
        status: "PARTIAL",
        costedSalesCount: 10,
        uncostedSalesCount: 5,
        reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING"],
      },
    });
    expect(gate.ratio).toBe(true);
    expect(gate.delta).toBe(false);
    expect(gate.amount).toBe(true);
  });

  it("keeps the amount but hides the ratio on PARTIAL", () => {
    const gate = evaluateMarginGate({
      isCogsLoaded: true,
      current: {
        status: "PARTIAL",
        costedSalesCount: 100,
        uncostedSalesCount: 71,
        reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING"],
      },
      previous: COMPLETE_PREVIOUS,
    });
    expect(gate.ratio).toBe(false);
    expect(gate.delta).toBe(false);
    expect(gate.amount).toBe(true);
    expect(gate.gated).toBe(true);
    expect(gate.reasonCodes).toEqual(["NO_EXPLICIT_INSUMO_MAPPING"]);
  });

  it("hides ratio AND amount on UNAVAILABLE (salesCogsNio not provably authoritative there)", () => {
    const gate = evaluateMarginGate({
      isCogsLoaded: true,
      current: {
        status: "UNAVAILABLE",
        costedSalesCount: 0,
        uncostedSalesCount: 171,
        reasonCodes: [],
      },
      previous: COMPLETE_PREVIOUS,
    });
    expect(gate.ratio).toBe(false);
    expect(gate.delta).toBe(false);
    expect(gate.amount).toBe(false);
    expect(gate.gated).toBe(true);
  });

  it("fails closed on unknown status and absent coverage while cogs loaded", () => {
    for (const current of [
      { status: "SOMETHING_ELSE" } as unknown as InventoryCoverage,
      null,
    ]) {
      const gate = evaluateMarginGate({
        isCogsLoaded: true,
        current,
        previous: COMPLETE_PREVIOUS,
      });
      expect(gate.ratio).toBe(false);
      expect(gate.delta).toBe(false);
      expect(gate.amount).toBe(false);
      expect(gate.gated).toBe(true);
    }
  });

  it("cogs not loaded keeps the legacy not-loaded rendering (no Sin costo note)", () => {
    const gate = evaluateMarginGate({
      isCogsLoaded: false,
      current: null,
      previous: null,
    });
    expect(gate.ratio).toBe(false);
    expect(gate.delta).toBe(false);
    expect(gate.amount).toBe(false);
    expect(gate.gated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Strip rendering — the owner's headline defect
// ---------------------------------------------------------------------------

describe("Margen Bruto coverage gate — strip rendering", () => {
  it("UNAVAILABLE with salesCogsNio = 0 never renders 100.0% or a fake delta", async () => {
    mockCogs(
      0,
      {
        status: "UNAVAILABLE",
        costedSalesCount: 0,
        uncostedSalesCount: 171,
        reasonCodes: [],
      },
      0,
      {
        status: "UNAVAILABLE",
        costedSalesCount: 0,
        uncostedSalesCount: 150,
        reasonCodes: [],
      },
    );

    renderStrip();

    // Wait for the settled gate (the note appears once the COGS read lands),
    // not merely for tile existence — the strip settles before COGS does.
    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    const tile = tileByLabel("Margen Bruto");
    expect(tile?.textContent).toContain("—");
    expect(tile?.textContent).not.toContain("100.0%");
    // No fabricated pp delta anywhere in the margin tile.
    expect(tile?.textContent).not.toMatch(/\+\d+(\.\d+)?\s*pp/);
    // The fabricated amount (netSales − 0 = C$48,520.50) must not render.
    expect(tile?.textContent).not.toContain("C$48,520.50");
    // "Sin costo" state with generic copy (no reason codes).
    expect(screen.getByTestId("kpi-margin-note").textContent).toContain(
      "Sin costo",
    );
  });

  it("PARTIAL with NO_EXPLICIT_INSUMO_MAPPING gates the ratio and shows the mapping-specific note, keeping the amount", async () => {
    mockCogs(
      18740,
      {
        status: "PARTIAL",
        costedSalesCount: 100,
        uncostedSalesCount: 71,
        reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING"],
      },
      19422.09,
      COMPLETE_PREVIOUS,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    const tile = tileByLabel("Margen Bruto");
    expect(tile?.textContent).toContain("—");
    expect(tile?.textContent).not.toContain("61.4%");
    // The cost grant exists and the COGS loaded, so the amount stays.
    expect(tile?.textContent).toContain("C$29,780.50");
    // Mapping-specific actionable copy — never the raw reason code.
    const note = screen.getByTestId("kpi-margin-note").textContent ?? "";
    expect(note).toContain("Sin costo");
    expect(note).toContain("insumos");
    expect(note).not.toContain("NO_EXPLICIT_INSUMO_MAPPING");
    // Note replaces the delta line: no pp delta while gated.
    expect(tile?.textContent).not.toMatch(/\+\d+(\.\d+)?\s*pp/);
  });

  it("COMPLETE costed period renders the ratio exactly as before (guard against over-blocking)", async () => {
    mockCogs(18740, COMPLETE_CURRENT, 19422.09, COMPLETE_PREVIOUS);

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Margen Bruto")?.textContent).toContain("61.4%");
    });
    const tile = tileByLabel("Margen Bruto");
    expect(tile?.textContent).toContain("C$29,780.50");
    expect(tile?.textContent).toContain("+6.4 pp");
    expect(screen.queryByTestId("kpi-margin-note")).not.toBeInTheDocument();
    // 5-tile matrix intact (Cuota Fija: 3 base + margin, no IVA).
    expect(screen.getAllByTestId("kpi-tile")).toHaveLength(4);
  });

  it("PARTIAL with ZERO_COST_BASIS gates the ratio and shows the purchase-cost note, keeping the amount (WU12)", async () => {
    mockCogs(
      18740,
      {
        status: "PARTIAL",
        costedSalesCount: 100,
        uncostedSalesCount: 71,
        reasonCodes: ["ZERO_COST_BASIS"],
      },
      19422.09,
      COMPLETE_PREVIOUS,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    const tile = tileByLabel("Margen Bruto");
    // Ratio still gated: — , never 61.4%.
    expect(tile?.textContent).toContain("—");
    expect(tile?.textContent).not.toContain("61.4%");
    // Amount stays on PARTIAL.
    expect(tile?.textContent).toContain("C$29,780.50");
    // Its own actionable note — points at recording purchase costs — never
    // the raw code and never the generic copy.
    const note = screen.getByTestId("kpi-margin-note").textContent ?? "";
    expect(note).toContain("Sin costo");
    expect(note).toContain("costo de compra");
    expect(note).not.toContain("ZERO_COST_BASIS");
    expect(note).not.toContain("datos de costo suficientes");
    // Note replaces the delta line: no pp delta while gated.
    expect(tile?.textContent).not.toMatch(/\+\d+(\.\d+)?\s*pp/);
  });

  it("unknown coverage status fails closed to — plus the generic Sin costo note", async () => {
    mockCogs(
      18740,
      { status: "SOMETHING_ELSE", costedSalesCount: 3, uncostedSalesCount: 0 },
      19422.09,
      COMPLETE_PREVIOUS,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    expect(tileByLabel("Margen Bruto")?.textContent).toContain("—");
    expect(tileByLabel("Margen Bruto")?.textContent).not.toContain("61.4%");
    const note = screen.getByTestId("kpi-margin-note").textContent ?? "";
    expect(note).toContain("Sin costo");
    expect(note).toContain("datos de costo suficientes");
  });

  it("absent coverage while cogs loaded fails closed (never infers from salesCogsNio)", async () => {
    // salesCogsNio > 0 must NOT be read as implicit coverage: the original
    // defect inferred trust from the COGS figure itself.
    mockCogs(18740, null, 19422.09, null);

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    expect(tileByLabel("Margen Bruto")?.textContent).toContain("—");
    expect(tileByLabel("Margen Bruto")?.textContent).not.toContain("61.4%");
    expect(tileByLabel("Margen Bruto")?.textContent).not.toContain(
      "C$29,780.50",
    );
  });

  it("suppresses the margin pp delta unless BOTH periods are COMPLETE", async () => {
    mockCogs(18740, COMPLETE_CURRENT, 19422.09, {
      status: "PARTIAL",
      costedSalesCount: 10,
      uncostedSalesCount: 140,
      reasonCodes: ["MISSING_INVENTORY_IMPACT"],
    });

    renderStrip();

    await waitFor(() => {
      expect(tileByLabel("Margen Bruto")?.textContent).toContain("61.4%");
    });
    expect(tileByLabel("Margen Bruto")?.textContent).not.toContain("+6.4 pp");
    // The suppressed delta degrades to the neutral no-base line.
    expect(tileByLabel("Margen Bruto")?.textContent).toContain(
      "Sin base comparable",
    );
  });

  it("AC-17: MANAGER without the cost grant sees no margin tile and no Sin costo text", async () => {
    useAuthStore.setState({ user: authUser("MANAGER") });
    mockCogs(
      0,
      {
        status: "UNAVAILABLE",
        costedSalesCount: 0,
        uncostedSalesCount: 171,
        reasonCodes: [],
      },
      0,
      null,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getAllByTestId("kpi-tile")).toHaveLength(3);
    });
    expect(screen.queryByText("Margen Bruto")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-margin-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin costo/)).not.toBeInTheDocument();
    expect(fetchCogs).not.toHaveBeenCalled();
  });
});

describe("Tile/card caveat parity (finding Q1-c)", () => {
  it("the PARTIAL tile carries the same incompleteness caveat as the Rentabilidad card", async () => {
    // D1's root cause was two surfaces with two honesty levels for ONE gate
    // state: the tile said only "Sin costo: …" while the card explained that
    // the amount shown is not the period's margin. The copy is now shared, so
    // this asserts both halves of the parity on the tile side.
    mockCogs(
      18740,
      {
        status: "PARTIAL",
        costedSalesCount: 120,
        uncostedSalesCount: 30,
        reasonCodes: ["NO_EXPLICIT_INSUMO_MAPPING"],
      },
      19422.09,
      COMPLETE_PREVIOUS,
    );

    renderStrip();

    await waitFor(() => {
      expect(screen.getByTestId("kpi-margin-note")).toBeInTheDocument();
    });
    const note = screen.getByTestId("kpi-margin-note").textContent ?? "";
    expect(note).toContain("Costo de ventas incompleto");
    expect(note).toContain("Mapea los insumos del producto");
    // Pinned refutation: no direction may be claimed. A canceled invoice
    // without its SALE_CANCEL reversal pushes this figure the opposite way
    // from an uncosted sale, and that invariant is not proven here.
    expect(note).not.toMatch(/mayor que el real|menor que el real|límite (superior|inferior)/);
  });
});
