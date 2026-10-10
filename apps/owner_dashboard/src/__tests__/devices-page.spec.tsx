/**
 * B17-03 Task 4 — DevicesPage unit & accessibility suite.
 *
 * Covers the oversight view for GET /identity/device-sync/terminals:
 * loading skeleton, first-use empty state, populated KPI summary + table
 * rows, error recovery ("Reintentar"), manual refresh ("Actualizar"), and
 * the a11y contract of the table (§46: color is never the only signal —
 * every status badge carries a textual label).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DevicesPage } from "@/features/devices";
import { fetchDevices } from "@/features/devices/devices-api";
import { useCanRevokeDevice } from "@/features/auth/permissions";
import type { TerminalDevice } from "@/features/devices/types";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/devices/devices-api", () => ({
  fetchDevices: vi.fn(),
}));

// B17-04 Task 5 — permission gate for the revocation column/button.
// Defaults to granted (OWNER) so existing suites are unaffected.
vi.mock("@/features/auth/permissions", () => ({
  useCanRevokeDevice: vi.fn(() => true),
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function deviceFixture(overrides: Partial<TerminalDevice> = {}): TerminalDevice {
  return {
    terminalId: "pos-term-01",
    label: "Caja Principal",
    credentialId: "cred-1",
    credentialVersion: 1,
    status: "ACTIVE",
    issuedAt: "2026-09-01T10:00:00Z",
    expiresAt: "2027-09-01T10:00:00Z",
    revokedAt: null,
    revocationReason: null,
    posBuild: "1.2.3",
    freshnessState: "COMPLETE",
    acceptedThroughSequence: 42,
    lastReceiptAt: "2026-10-10T12:00:00Z",
    hasDeclaredGaps: false,
    hasInventoryPending: false,
    inventoryPendingCount: 0,
    ...overrides,
  };
}

const POPULATED_FIXTURES: TerminalDevice[] = [
  deviceFixture(),
  deviceFixture({
    terminalId: "pos-term-02",
    label: "pos-term-02",
    credentialId: "cred-2",
    status: "REVOKED",
    revokedAt: "2026-09-20T18:00:00Z",
    revocationReason: "Robo de equipo",
    freshnessState: null,
    acceptedThroughSequence: null,
    lastReceiptAt: null,
  }),
];

beforeEach(() => {
  vi.mocked(fetchDevices).mockReset();
  vi.mocked(useCanRevokeDevice).mockReturnValue(true);
});

describe("DevicesPage — loading state", () => {
  it("renders the loading skeleton with role=status while the query is in flight", async () => {
    vi.mocked(fetchDevices).mockReturnValue(new Promise(() => {}));

    renderWithQueryClient(createElement(DevicesPage));

    const skeleton = await screen.findByRole("status");
    expect(skeleton).toHaveAttribute("aria-label", "Cargando terminales...");
    expect(
      screen.getByTestId("devices-loading-state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("devices-table")).not.toBeInTheDocument();
  });
});

describe("DevicesPage — empty state", () => {
  it("renders the first-use empty message when no terminals are linked", async () => {
    vi.mocked(fetchDevices).mockResolvedValue([]);

    renderWithQueryClient(createElement(DevicesPage));

    expect(
      await screen.findByText("No hay terminales vinculadas"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("devices-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("devices-table")).not.toBeInTheDocument();
  });
});

describe("DevicesPage — populated state", () => {
  it("renders KPI summary counts for the linked terminal fleet", async () => {
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    const summary = await screen.findByLabelText("Resumen de terminales");
    // KPI cards render label <p> followed by count <p>; assert the exact
    // sequence Total: 2, Activas: 1, Revocadas: 1, En sincronía: 1.
    const cards = within(summary).getAllByText(
      /^(Total|Activas|Revocadas|En sincronía)$/,
    );
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.nextElementSibling?.textContent)).toEqual([
      "2",
      "1",
      "1",
      "1",
    ]);
  });

  it("renders terminal rows with identity, credential status, freshness and sequence", async () => {
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    // Wait for the query to resolve and the table to render.
    await screen.findByRole("table");

    // Row 1: identity, active credential badge, in-sync freshness, sequence.
    const row1 = screen.getByText("Caja Principal").closest("tr");
    expect(row1).not.toBeNull();
    expect(row1).toHaveTextContent("pos-term-01");
    within(row1 as HTMLElement).getByText("Activo");
    within(row1 as HTMLElement).getByText("En sincronía");
    within(row1 as HTMLElement).getByText("#42");
    within(row1 as HTMLElement).getByText("1.2.3");

    // Row 2: revoked credential, no freshness verdict, no receipt evidence.
    // "Nunca" only renders for a device with lastReceiptAt === null.
    const row2 = screen.getByText("Nunca").closest("tr");
    expect(row2).not.toBeNull();
    // Terminal id and label are both "pos-term-02" (§29: no fabricated label).
    expect(within(row2 as HTMLElement).getAllByText("pos-term-02")).toHaveLength(
      2,
    );
    within(row2 as HTMLElement).getByText("Revocado");
    within(row2 as HTMLElement).getByText("Sin sincronizar");
    // Two dashes: missing sequence evidence (§34) and the non-actionable
    // Acciones cell for a REVOKED credential.
    expect(within(row2 as HTMLElement).getAllByText("—")).toHaveLength(2);
  });

  it("gates the revocation action by permission and credential status", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    await screen.findByRole("table");

    // B17-04: revocation is only offered to users with the revoke grant.
    expect(
      screen.getByRole("columnheader", { name: "Acciones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revocar terminal pos-term-01" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revocar terminal pos-term-02" }),
    ).not.toBeInTheDocument();

    // Clicking Revocar opens the destructive confirmation dialog.
    await user.click(
      screen.getByRole("button", { name: "Revocar terminal pos-term-01" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Revocar credencial de terminal"),
    ).toBeInTheDocument();
  });

  it("hides the Acciones column entirely without the revoke permission", async () => {
    vi.mocked(useCanRevokeDevice).mockReturnValue(false);
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    await screen.findByRole("table");

    expect(
      screen.queryByRole("columnheader", { name: "Acciones" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revocar/ })).not.toBeInTheDocument();
  });
});

describe("DevicesPage — error state", () => {
  it("renders the error alert with a Reintentar button that re-triggers the query", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDevices)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    const errorState = await screen.findByTestId("devices-error-state");
    expect(errorState).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: /Reintentar/i });
    expect(retry).toBeInTheDocument();

    await user.click(retry);

    // Recovery: the retry resolves and the table renders again.
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchDevices).toHaveBeenCalledTimes(2);
    });
  });
});

describe("DevicesPage — manual refresh", () => {
  it("re-fetches the device list when Actualizar is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);

    renderWithQueryClient(createElement(DevicesPage));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(fetchDevices).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Actualizar/i }));

    await waitFor(() => {
      expect(fetchDevices).toHaveBeenCalledTimes(2);
    });
  });
});

describe("DevicesPage — accessibility", () => {
  beforeEach(() => {
    vi.mocked(fetchDevices).mockResolvedValue(POPULATED_FIXTURES);
  });

  it("exposes the table with the POS-terminal list aria-label and header cells", async () => {
    renderWithQueryClient(createElement(DevicesPage));

    const table = await screen.findByRole("table");
    expect(table).toHaveAttribute(
      "aria-label",
      "Listado de terminales de punto de venta",
    );
    for (const header of [
      "Terminal",
      "Estado",
      "Frescura",
      "Última Sincronización",
      "Versión POS",
      "Credencial",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  it("renders status badges with textual labels and no color-only signal", async () => {
    renderWithQueryClient(createElement(DevicesPage));

    const table = await screen.findByRole("table");
    // Badge renders as a <div> (shadcn Badge); the label text is a direct
    // child, so getByText resolves to the badge element itself.
    const statusBadge = screen.getByText("Activo");
    expect(statusBadge.tagName).toBe("DIV");
    expect(table).toContainElement(statusBadge);

    // §46: the colored dot inside each badge is decorative and hidden from
    // assistive tech; the label itself is the accessible content. Scoped to
    // the table so the KPI "En sincronía" label is not matched.
    for (const badge of within(table).getAllByText(
      /^(Activo|Revocado|En sincronía|Sin sincronizar)$/,
    )) {
      const dots = badge.querySelectorAll("span[aria-hidden='true']");
      expect(dots.length).toBe(1);
    }
  });
});
