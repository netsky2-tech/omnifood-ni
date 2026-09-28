import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CashPage } from "@/features/cash/cash-page";
import { useAuthStore } from "@/features/auth/auth-store";
import { canAccessRoute } from "@/lib/rbac";
import { setTokens, clearTokens } from "@/lib/api";
import type { CashShiftSession } from "@/features/cash/types";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderCashPage(initialUrl = "/cash") {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/cash" element={<CashPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setRole(role: "OWNER" | "MANAGER" | "CASHIER" | "WAITER") {
  useAuthStore.setState({
    user: {
      id: "u-1",
      name: "Operador",
      role,
      email: "op@test.ni",
      active: true,
      tenantId: "tenant-1",
    },
    tenant: { id: "tenant-1", name: "Test", slug: "test", ruc: "", active: true },
    isAuthenticated: true,
    hydrated: true,
  });
}

const OPEN_SESSION: CashShiftSession = {
  id: "shift-open-1",
  tenant_id: "tenant-1",
  terminal_id: "POS-01",
  cashier_id: "usr-cajero",
  cashier_name: "María López",
  opened_at: "2026-09-25T14:30:00.000Z",
  closed_at: null,
  status: "OPEN",
  initial_float_nio: 1000,
  initial_float_usd: 50,
  expected_cash_nio: 4500,
  expected_cash_usd: 80,
  final_counted_nio: null,
  final_counted_usd: null,
  difference_nio: null,
  difference_usd: null,
  z_report_sequence: null,
};

const CLOSED_SESSION: CashShiftSession = {
  id: "shift-closed-1",
  tenant_id: "tenant-1",
  terminal_id: "POS-02",
  cashier_id: "usr-cajero-2",
  cashier_name: "Juan Pérez",
  opened_at: "2026-09-24T13:00:00.000Z",
  closed_at: "2026-09-24T21:15:00.000Z",
  status: "CLOSED",
  initial_float_nio: 1000,
  initial_float_usd: 50,
  expected_cash_nio: 2500,
  expected_cash_usd: 100,
  final_counted_nio: 2480,
  final_counted_usd: 100,
  difference_nio: -20,
  difference_usd: 0,
  z_report_sequence: 15,
};

const FRESHNESS = {
  state: "COMPLETE",
  lastCompleteAt: "2026-09-25T14:00:00.000Z",
  thresholdMinutes: 15,
  perTerminal: [],
};

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchOk(sessions: CashShiftSession[]) {
  fetchSpy.mockImplementation(async (url: string) => {
    if (String(url).includes("/operations/sync/freshness")) {
      return new Response(JSON.stringify(FRESHNESS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(sessions), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
  setRole("OWNER");
  mockFetchOk([CLOSED_SESSION, OPEN_SESSION]);
});

afterEach(() => {
  clearTokens();
  useAuthStore.setState({
    user: null,
    tenant: null,
    isAuthenticated: false,
    hydrated: true,
  });
  vi.unstubAllGlobals();
});

describe("Cash sessions page (batch 6 slice 6a — finding B6)", () => {
  it("renders the heading, scope description and the six table columns", async () => {
    renderCashPage();

    await waitFor(() => {
      expect(screen.getByText("POS-01")).toBeInTheDocument();
    });

    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Cajero")).toBeInTheDocument();
    expect(screen.getByText("Apertura")).toBeInTheDocument();
    expect(screen.getByText("Cierre")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Diferencia")).toBeInTheDocument();
  });

  it("renders session rows with human labels and no raw backend codes", async () => {
    renderCashPage();

    await waitFor(() => {
      expect(screen.getByText("POS-01")).toBeInTheDocument();
    });

    expect(screen.getByText("María López")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();

    // §26/§27 canonical vocabulary, never the raw OPEN/CLOSED enum values.
    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(screen.getByText("Cerrado")).toBeInTheDocument();
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
    expect(screen.queryByText("CLOSED")).not.toBeInTheDocument();
  });

  it("shows — for unavailable values on open sessions and the signed difference on closed ones", async () => {
    renderCashPage();

    await waitFor(() => {
      expect(screen.getByText("POS-01")).toBeInTheDocument();
    });

    // The closed session reports its variance; the open one has no cierre
    // nor difference yet — unavailable is —, never 0 (§34).
    expect(screen.getByText("-C$20.00")).toBeInTheDocument();
    const openRow = screen.getByText("POS-01").closest("tr");
    expect(openRow).toHaveTextContent("—");
  });

  it("renders a loading state before data arrives", async () => {
    fetchSpy.mockImplementation(() => new Promise(() => undefined));
    renderCashPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cargando sesiones de caja",
    );
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();
  });

  it("renders an error state with a meaningful message and retry", async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes("/operations/sync/freshness")) {
        return new Response(JSON.stringify(FRESHNESS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderCashPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Error en el servidor/),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("recovers through the retry button after a transient failure", async () => {
    const user = userEvent.setup();
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes("/operations/sync/freshness")) {
        return new Response(JSON.stringify(FRESHNESS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderCashPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });

    mockFetchOk([CLOSED_SESSION, OPEN_SESSION]);
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));

    await waitFor(() => {
      expect(screen.getByText("POS-01")).toBeInTheDocument();
    });
  });

  it("renders the first-use empty state when the tenant has no sessions", async () => {
    mockFetchOk([]);
    renderCashPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Todavía no hay sesiones de caja/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/verificarlo de forma remota sin ir al local/i),
    ).toBeInTheDocument();
  });

  it("renders the filtered empty state with a reset action when the status filter returns nothing", async () => {
    mockFetchOk([]);
    renderCashPage("/cash?status=CLOSED");

    await waitFor(() => {
      expect(
        screen.getByText(/No hay sesiones con este estado/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Ver todas las sesiones/ }),
    ).toBeInTheDocument();
  });

  it("sends the status filter as a query param when present in the URL", async () => {
    renderCashPage("/cash?status=OPEN");

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes("/sales/shifts?status=OPEN"))).toBe(
        true,
      );
    });
  });

  // NHILOS §15 (slice 6a verification): the backend page-caps the list with
  // no total-count contract, so the page must never imply completeness when
  // the page is full. The frontend sends an explicit limit=50 and renders a
  // truncation signal exactly when the response fills the page.
  describe("truncation signal (NHILOS §15)", () => {
    const FULL_PAGE_LIMIT = 50;

    function makeSessions(count: number): CashShiftSession[] {
      return Array.from({ length: count }, (_, i) => ({
        ...CLOSED_SESSION,
        id: `shift-closed-${i}`,
        terminal_id: `POS-${String(i).padStart(2, "0")}`,
      }));
    }

    it("sends an explicit limit=50 to the backend", async () => {
      renderCashPage();

      await waitFor(() => {
        const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes("/sales/shifts") && u.includes("limit=50"))).toBe(
          true,
        );
      });
    });

    it("shows the truncation copy when the response fills the page", async () => {
      mockFetchOk(makeSessions(FULL_PAGE_LIMIT));
      renderCashPage();

      await waitFor(() => {
        expect(
          screen.getByText(
            /Mostrando las 50 sesiones más recientes — puede haber más registros/i,
          ),
        ).toBeInTheDocument();
      });
      // The plain count must NOT be shown as if the list were complete.
      expect(screen.queryByText(/Mostrando \d+ sesiones$/)).not.toBeInTheDocument();
    });

    it("does not show the truncation copy when fewer rows return", async () => {
      mockFetchOk([CLOSED_SESSION, OPEN_SESSION]);
      renderCashPage();

      await waitFor(() => {
        expect(screen.getByText("POS-01")).toBeInTheDocument();
      });

      expect(screen.getByText(/Mostrando 2 sesiones/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/puede haber más registros/i),
      ).not.toBeInTheDocument();
    });
  });

  it("gates the route by role: OWNER and MANAGER can access, CASHIER and WAITER cannot", () => {
    // Mirrors the backend @Roles(OWNER, MANAGER) on GET /sales/shifts; the
    // same rbac gate drives both the ProtectedRoute and the sidebar filter.
    expect(canAccessRoute("OWNER", "/cash")).toBe(true);
    expect(canAccessRoute("MANAGER", "/cash")).toBe(true);
    expect(canAccessRoute("CASHIER", "/cash")).toBe(false);
    expect(canAccessRoute("WAITER", "/cash")).toBe(false);
  });

  it("exposes POS-sync freshness on the page instead of implying live data (§35)", async () => {
    renderCashPage();

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toBeInTheDocument();
    });
  });
});
