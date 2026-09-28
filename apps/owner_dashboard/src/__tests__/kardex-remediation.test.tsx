import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { KardexPage } from "@/features/kardex/kardex-page";
import { Toaster } from "@/components/ui/toaster";
import { useAuthStore } from "@/features/auth/auth-store";
import { canAccessRoute, canPerformAction } from "@/lib/rbac";
import { setTokens, clearTokens } from "@/lib/api";
import type { KardexPendingCorrection } from "@/features/kardex/types";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderKardexPage(initialUrl = "/kardex") {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/kardex" element={<KardexPage />} />
        </Routes>
        <Toaster />
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

const CORRECTION: KardexPendingCorrection = {
  queueId: "queue-uuid-1",
  status: "PENDING",
  insumoId: "ins-uuid-1",
  insumoName: "Leche entera",
  previousUnitCostNio: 50,
  recalculatedUnitCostNio: 70,
  deltaUnitCostNio: 20,
  totalDeltaCostNio: 400,
  affectedQuantity: 20,
  triggerMovementType: "ENTRADA_COMPRA",
  detectedAt: "2026-09-25T14:00:00.000Z",
};

const UNKNOWN_CORRECTION: KardexPendingCorrection = {
  queueId: "queue-uuid-2",
  status: "BLOCKED",
  insumoId: "ins-uuid-2",
  insumoName: null,
  previousUnitCostNio: null,
  recalculatedUnitCostNio: null,
  deltaUnitCostNio: null,
  totalDeltaCostNio: null,
  affectedQuantity: null,
  triggerMovementType: null,
  detectedAt: "2026-09-24T10:30:00.000Z",
};

const FRESHNESS = {
  state: "COMPLETE",
  lastCompleteAt: "2026-09-25T14:00:00.000Z",
  thresholdMinutes: 15,
  perTerminal: [],
};

let fetchSpy: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockPendingRoute(handler: () => Promise<Response>) {
  fetchSpy.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/operations/sync/freshness")) {
      return jsonResponse(FRESHNESS);
    }
    if (u.includes("/inventory/regularization/pending")) {
      return handler();
    }
    return jsonResponse({});
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
  setRole("OWNER");
  mockPendingRoute(async () => jsonResponse([CORRECTION, UNKNOWN_CORRECTION]));
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

describe("Kardex remediation page (batch 6 slice 6c — finding H7)", () => {
  it("renders the heading, scope description and the table columns", async () => {
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText("Leche entera")).toBeInTheDocument();
    });

    expect(screen.getByText("Correcciones de Inventario")).toBeInTheDocument();
    expect(screen.getByText("Insumo")).toBeInTheDocument();
    expect(screen.getByText("Cantidad afectada")).toBeInTheDocument();
    expect(screen.getByText("Costo unitario")).toBeInTheDocument();
    expect(screen.getByText("Impacto total")).toBeInTheDocument();
    expect(screen.getByText("Detectada")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
  });

  it("renders correction rows with human labels and no raw backend codes or internal ids", async () => {
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText("Leche entera")).toBeInTheDocument();
    });

    // §26/§27 canonical vocabulary, never the raw enum values.
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Bloqueado")).toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    expect(screen.queryByText("BLOCKED")).not.toBeInTheDocument();
    expect(screen.queryByText("ENTRADA_COMPRA")).not.toBeInTheDocument();

    // §12.2: internal queue ids are keys, not visible content.
    expect(screen.queryByText("queue-uuid-1")).not.toBeInTheDocument();
    expect(screen.queryByText("queue-uuid-2")).not.toBeInTheDocument();

    // Detection reason is human copy, not the raw movement type.
    expect(screen.getByText(/por entrada de compra/i)).toBeInTheDocument();
  });

  it("formats amounts and quantities as tabular es-NI values", async () => {
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText("Leche entera")).toBeInTheDocument();
    });

    expect(screen.getByText("C$400.00")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === "C$50.00 → C$70.00",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("renders — for unknown insumo and cost values instead of zeros (§34)", async () => {
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText(/Insumo sin nombre/)).toBeInTheDocument();
    });

    const unknownRow = screen.getByText(/Insumo sin nombre/).closest("tr");
    expect(unknownRow).toHaveTextContent("—");
    // Unknown must never be rendered as a fabricated 0 amount.
    expect(unknownRow).not.toHaveTextContent("C$0.00");
  });

  it("renders a loading state before data arrives", async () => {
    mockPendingRoute(() => new Promise(() => undefined));
    renderKardexPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cargando correcciones pendientes",
    );
    expect(screen.queryByText("Insumo")).not.toBeInTheDocument();
  });

  it("renders the first-use empty state when there are no pending corrections", async () => {
    mockPendingRoute(async () => jsonResponse([]));
    renderKardexPage();

    await waitFor(() => {
      expect(
        screen.getByText(/No hay correcciones pendientes/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/sin ir al local/i),
    ).toBeInTheDocument();
  });

  it("renders an error state with a meaningful message and retry, then recovers", async () => {
    const user = userEvent.setup();
    mockPendingRoute(async () => jsonResponse({}, 500));
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText(/Error en el servidor/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Reintentar/ }),
    ).toBeInTheDocument();

    mockPendingRoute(async () => jsonResponse([CORRECTION]));
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));

    await waitFor(() => {
      expect(screen.getByText("Leche entera")).toBeInTheDocument();
    });
  });

  describe("approval flow (NHILOS §23 — object, consequence, reversibility, scope)", () => {
    function openDialog(user: ReturnType<typeof userEvent.setup>) {
      const row = screen.getByText("Leche entera").closest("tr")!;
      return user.click(
        within(row as HTMLElement).getByRole("button", {
          name: /Aprobar corrección/,
        }),
      );
    }

    it("shows the consequence copy and the explicit verb before approving (§23.1/§23.3/AP-19)", async () => {
      const user = userEvent.setup();
      renderKardexPage();
      await waitFor(() => {
        expect(screen.getByText("Leche entera")).toBeInTheDocument();
      });

      await openDialog(user);

      const dialog = screen.getByRole("dialog");
      // Object: which correction.
      expect(within(dialog).getByText("Leche entera")).toBeInTheDocument();
      // Consequence (AP-19): what the approval changes.
      expect(
        within(dialog).getByText(/C\$50\.00/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/C\$70\.00/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/C\$400\.00/),
      ).toBeInTheDocument();
      // Reversibility: the correction is permanent.
      expect(
        within(dialog).getByText(/no se puede deshacer/i),
      ).toBeInTheDocument();
      // Scope: tenant-wide inventory for the insumo.
      expect(
        within(dialog).getByText(/inventario de todo tu comercio/i),
      ).toBeInTheDocument();
      // §23.3: explicit verb, never "Aceptar"/"OK".
      expect(
        within(dialog).getByRole("button", { name: "Aprobar corrección" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: /^Aceptar$/ }),
      ).not.toBeInTheDocument();
    });

    it("sends the approval with the honest authMethod and refreshes the queue on success", async () => {
      const user = userEvent.setup();
      const postCalls: Array<{ url: string; body: unknown }> = [];
      let pendingCalls = 0;
      let resolveSecondGet!: (r: Response) => void;

      fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/operations/sync/freshness")) {
          return jsonResponse(FRESHNESS);
        }
        if (u.includes("/inventory/regularization/pending")) {
          pendingCalls++;
          if (pendingCalls === 1) {
            return jsonResponse([CORRECTION]);
          }
          // Hold the post-approval refetch open so the test can observe the
          // "Actualizando…" state (§28.3) before the empty queue lands.
          return new Promise<Response>((resolve) => {
            resolveSecondGet = resolve;
          });
        }
        if (u.includes("/inventory/regularization/approve")) {
          postCalls.push({
            url: u,
            body: JSON.parse(String(init?.body ?? "{}")),
          });
          return jsonResponse({ id: "corr-new-1" });
        }
        return jsonResponse({});
      });
      renderKardexPage();
      await waitFor(() => {
        expect(screen.getByText("Leche entera")).toBeInTheDocument();
      });

      await openDialog(user);
      const dialog = screen.getByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Aprobar corrección" }),
      );

      // §33: the wire contract carries the web-console authorization
      // declaration and the exact queue id; no fake PIN payload.
      await waitFor(() => {
        expect(postCalls).toHaveLength(1);
      });
      expect(postCalls[0]!.url).toContain("/inventory/regularization/approve");
      expect(postCalls[0]!.body).toEqual({
        queueId: "queue-uuid-1",
        authMethod: "WEB_CONSOLE",
      });

      // §19.2: specific, calm success copy.
      expect(await screen.findByText("Corrección aprobada")).toBeInTheDocument();

      // §28.3: queue refresh keeps the page mounted and says so.
      expect(await screen.findByText("Actualizando…")).toBeInTheDocument();

      resolveSecondGet(jsonResponse([]));
      await waitFor(() => {
        expect(
          screen.getByText(/No hay correcciones pendientes/i),
        ).toBeInTheDocument();
      });
      expect(pendingCalls).toBe(2);
    });

    it("surfaces the failure without collapsing it into success and keeps the dialog open (§16/§30.1)", async () => {
      const user = userEvent.setup();
      let pendingCalls = 0;
      fetchSpy.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.includes("/operations/sync/freshness")) {
          return jsonResponse(FRESHNESS);
        }
        if (u.includes("/inventory/regularization/pending")) {
          pendingCalls++;
          return jsonResponse([CORRECTION]);
        }
        if (u.includes("/inventory/regularization/approve")) {
          // 403 keeps the test on the clean ApiError path (a 401 would
          // trigger the client's token-refresh flow, which is not what this
          // test exercises). The governance denial copy is the same shape the
          // backend emits when the approver's role exceeds its threshold.
          return jsonResponse(
            {
              message:
                "Rol 'manager' no tiene autorización para regularizar con motivo: UMBRAL_SUPERVISOR_EXCEDIDO",
            },
            403,
          );
        }
        return jsonResponse({});
      });

      renderKardexPage();
      await waitFor(() => {
        expect(screen.getByText("Leche entera")).toBeInTheDocument();
      });

      await openDialog(user);
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Aprobar corrección",
        }),
      );

      // The specific server reason is surfaced — never a generic success.
      expect(
        await screen.findByText("No pudimos aprobar la corrección"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/UMBRAL_SUPERVISOR_EXCEDIDO/),
      ).toBeInTheDocument();

      // §30.1: the dialog and its context survive the failure.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // No fake refresh: the pending list was not invalidated.
      expect(pendingCalls).toBe(1);
    });
  });

  it("gates the route and the approval action by role: OWNER/MANAGER can, CASHIER/WAITER cannot", () => {
    // Mirrors the backend @Roles(OWNER, MANAGER) on both regularization
    // routes; the same rbac gates drive ProtectedRoute, the sidebar filter
    // and the action column (§33.1 omit-and-reflow).
    expect(canAccessRoute("OWNER", "/kardex")).toBe(true);
    expect(canAccessRoute("MANAGER", "/kardex")).toBe(true);
    expect(canAccessRoute("CASHIER", "/kardex")).toBe(false);
    expect(canAccessRoute("WAITER", "/kardex")).toBe(false);

    expect(canPerformAction("OWNER", "kardex.approve")).toBe(true);
    expect(canPerformAction("MANAGER", "kardex.approve")).toBe(true);
    expect(canPerformAction("CASHIER", "kardex.approve")).toBe(false);
    expect(canPerformAction("WAITER", "kardex.approve")).toBe(false);
  });

  it("omits the approval column entirely when the role cannot approve (§33.1)", async () => {
    setRole("CASHIER");
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByText("Leche entera")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Aprobar corrección/ })).not.toBeInTheDocument();
  });

  it("exposes POS-sync freshness on the page instead of implying live data (§35)", async () => {
    renderKardexPage();

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toBeInTheDocument();
    });
  });
});
