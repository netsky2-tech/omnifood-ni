/**
 * Reconciliaciones tab — read-only reconciliation drill-down list.
 *
 * Authorities:
 * - docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md §9.2/§9.3
 *   (context-rich drill-down, deep-link destinations consume their context)
 *   and §9.4 (URL-first filters survive refresh/back-forward).
 * - AGENTS.md "Local SQLite is the Source of Truth": the dashboard never
 *   writes reconciliations; this tab is list-only.
 *
 * Mock style follows dashboard-v2-attention.spec.tsx: the fetch layer is
 * mocked while the real hook/normalizer logic runs under a real QueryClient.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconciliationsTab } from "@/features/sales/reconciliations-tab";
import {
  fetchReconciliations,
  normalizeReconciliationList,
  type ReconciliationListResponse,
} from "@/features/dashboard/dashboard-api";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/dashboard/dashboard-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchReconciliations: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchReconciliations);

// A raw uuid as it would arrive in reconciledByUserId — must NEVER reach
// the owner-visible DOM.
const RAW_RECONCILER_UUID = "8b1f0a2e-6d4c-4a9b-9e2f-1c3d5e7f9a01";

const rowFixture = (overrides: Record<string, unknown> = {}) => ({
  paymentId: "pay-1",
  invoiceId: "inv-1",
  invoiceNumber: "001-001-01-00000042",
  amount: 500,
  amountNio: 500,
  currency: "NIO",
  method: "CARD_NIO",
  voucherCode: "VCH-123456",
  reconciliationStatus: "PENDIENTE",
  reconciledAt: null,
  reconciledByUserId: RAW_RECONCILER_UUID,
  overrideSupervisorRef: null,
  terminalId: "term-1",
  operatorName: "María López",
  createdAt: "2026-09-23T14:30:00Z",
  ...overrides,
});

const listPayload = (
  rows: Record<string, unknown>[],
  paginationOverrides: Record<string, unknown> = {},
): ReconciliationListResponse =>
  ({
    reconciliations: rows,
    pagination: {
      page: 1,
      limit: 25,
      total: rows.length,
      totalPages: 1,
      ...paginationOverrides,
    },
  }) as unknown as ReconciliationListResponse;

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.search}</span>;
}

function renderTab(initialEntry = "/sales?tab=reconciliations", initialStatus?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <ReconciliationsTab initialStatus={initialStatus} />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReconciliationsTab — the date-range trap (§9.3: destination consumes its context)", () => {
  it("does NOT send startDate/endDate for the pending view (server date filter applies to reconciled_at, which is NULL while pending)", async () => {
    mockedFetch.mockResolvedValue(listPayload([rowFixture()]));

    renderTab("/sales?tab=reconciliations&reconciliationStatus=PENDIENTE");

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalled();
    });
    const params = mockedFetch.mock.calls[0]?.[0];
    if (!params) throw new Error("expected a fetchReconciliations call");
    expect(params.status).toBe("PENDIENTE");
    expect(params).not.toHaveProperty("startDate");
    expect(params).not.toHaveProperty("endDate");
  });

  it("does not send a date range for the default (all-status) view either", async () => {
    mockedFetch.mockResolvedValue(listPayload([rowFixture()]));

    renderTab("/sales?tab=reconciliations");

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalled();
    });
    const params = mockedFetch.mock.calls[0]?.[0];
    if (!params) throw new Error("expected a fetchReconciliations call");
    expect(params.status).toBeUndefined();
    expect(params).not.toHaveProperty("startDate");
    expect(params).not.toHaveProperty("endDate");
  });

  it("explains on the PENDIENTE view that reconciliation happens on the POS terminal (instruction, not a button)", async () => {
    mockedFetch.mockResolvedValue(listPayload([rowFixture()]));

    renderTab("/sales?tab=reconciliations&reconciliationStatus=PENDIENTE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-pending-note")).toBeInTheDocument();
    });
    expect(screen.getByTestId("reconciliations-pending-note").textContent).toContain(
      "terminal POS",
    );
  });
});

describe("ReconciliationsTab — honest operator identity", () => {
  it("renders the honest fallback for a null operatorName and never leaks the raw reconciler uuid", async () => {
    mockedFetch.mockResolvedValue(
      listPayload([rowFixture({ operatorName: null })]),
    );

    renderTab("/sales?tab=reconciliations&reconciliationStatus=PENDIENTE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-table")).toBeInTheDocument();
    });
    expect(screen.getByText("No verificable")).toBeInTheDocument();
    expect(screen.queryByText(RAW_RECONCILER_UUID)).not.toBeInTheDocument();
  });

  it("surfaces the declared supervisor credential on MANUAL_OVERRIDE rows with the quiet 'declarado, no validado' cue", async () => {
    mockedFetch.mockResolvedValue(
      listPayload([
        rowFixture({
          reconciliationStatus: "MANUAL_OVERRIDE",
          operatorName: null,
          overrideSupervisorRef: "SUP-0777",
          reconciledAt: "2026-09-23T15:00:00Z",
        }),
      ]),
    );

    renderTab("/sales?tab=reconciliations&reconciliationStatus=MANUAL_OVERRIDE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-table")).toBeInTheDocument();
    });
    const cell = screen.getByText("SUP-0777 — declarado, no validado");
    expect(cell).toBeInTheDocument();
    expect(screen.getByText("No verificable")).toBeInTheDocument();
    expect(screen.queryByText(RAW_RECONCILER_UUID)).not.toBeInTheDocument();
    // Text conveys status, never color alone (§28).
    expect(screen.getByText("Override manual")).toBeInTheDocument();
  });

  it("shows 'No declarado' when a MANUAL_OVERRIDE row carries no supervisor credential", async () => {
    mockedFetch.mockResolvedValue(
      listPayload([
        rowFixture({
          reconciliationStatus: "MANUAL_OVERRIDE",
          operatorName: "María López",
          overrideSupervisorRef: null,
          reconciledAt: "2026-09-23T15:00:00Z",
        }),
      ]),
    );

    renderTab("/sales?tab=reconciliations&reconciliationStatus=MANUAL_OVERRIDE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-table")).toBeInTheDocument();
    });
    expect(screen.getByText("Supervisor: No declarado")).toBeInTheDocument();
    expect(screen.getByText("María López")).toBeInTheDocument();
  });
});

describe("ReconciliationsTab — empty vs failed (the standard requires the distinction)", () => {
  it("renders the zero-results state when the list is empty", async () => {
    mockedFetch.mockResolvedValue(listPayload([]));

    renderTab("/sales?tab=reconciliations&reconciliationStatus=CONCILIADO");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-empty")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("reconciliations-table")).not.toBeInTheDocument();
  });

  it("renders a distinct load-failed state when the fetch errors", async () => {
    mockedFetch.mockRejectedValue(new Error("boom"));

    renderTab("/sales?tab=reconciliations&reconciliationStatus=PENDIENTE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("reconciliations-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reconciliations-table")).not.toBeInTheDocument();
  });
});

describe("ReconciliationsTab — URL-first filter and pagination (§9.4)", () => {
  it("writes the status filter and page into the URL and refetches with the new params", async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(
        listPayload([rowFixture()], { page: 1, total: 40, totalPages: 2 }),
      )
      .mockResolvedValue(
        listPayload(
          [rowFixture({ paymentId: "pay-2", voucherCode: "VCH-777" })],
          { page: 2, total: 40, totalPages: 2 },
        ),
      );

    renderTab("/sales?tab=reconciliations&reconciliationStatus=PENDIENTE");

    await waitFor(() => {
      expect(screen.getByTestId("reconciliations-next")).toBeEnabled();
    });

    await user.click(screen.getByTestId("reconciliations-next"));

    expect(screen.getByTestId("location-probe").textContent).toContain("page=2");
    await waitFor(() => {
      expect(mockedFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, status: "PENDIENTE" }),
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    await user.selectOptions(
      screen.getByTestId("reconciliation-status-filter"),
      "CONCILIADO",
    );

    expect(screen.getByTestId("location-probe").textContent).toContain(
      "reconciliationStatus=CONCILIADO",
    );
    // Changing the filter resets the page (no stranded deep page on a new filter).
    expect(screen.getByTestId("location-probe").textContent).not.toContain("page=");
    await waitFor(() => {
      expect(mockedFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "CONCILIADO", page: 1 }),
        expect.anything(),
      );
    });
  });
});

describe("normalizeReconciliationList — tolerant wire normalization", () => {
  it("tolerates a missing/short payload without fabricating values", () => {
    expect(normalizeReconciliationList(null)).toEqual({
      reconciliations: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    });
    expect(normalizeReconciliationList({})).toEqual({
      reconciliations: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    });

    const short = normalizeReconciliationList({
      reconciliations: [{ paymentId: "pay-1" }],
    });
    expect(short.reconciliations).toHaveLength(1);
    const row = short.reconciliations[0];
    if (!row) throw new Error("expected one normalized row");
    // Absent strings stay null (never fabricated), numbers coerce fail-closed.
    expect(row.paymentId).toBe("pay-1");
    expect(row.operatorName).toBeNull();
    expect(row.voucherCode).toBeNull();
    expect(row.terminalId).toBeNull();
    expect(row.overrideSupervisorRef).toBeNull();
    expect(row.reconciledAt).toBeNull();
    expect(row.amount).toBe(0);
    expect(row.amountNio).toBe(0);
    expect(short.pagination).toEqual({ page: 1, limit: 25, total: 0, totalPages: 0 });
  });

  it("coerces numeric strings (Postgres numeric-on-the-wire) through the repo coercion helper", () => {
    const list = normalizeReconciliationList({
      reconciliations: [rowFixture({ amount: "500.5", amountNio: "500.5" })],
      pagination: { page: "2", limit: "25", total: "31", totalPages: "2" },
    });
    expect(list.reconciliations[0]?.amount).toBe(500.5);
    expect(list.reconciliations[0]?.amountNio).toBe(500.5);
    expect(list.pagination).toEqual({ page: 2, limit: 25, total: 31, totalPages: 2 });
  });
});
