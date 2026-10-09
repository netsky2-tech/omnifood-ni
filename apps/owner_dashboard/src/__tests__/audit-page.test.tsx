import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "@/features/audit/audit-page";
import { useAuthStore } from "@/features/auth/auth-store";
import { canAccessRoute } from "@/lib/rbac";
import { setTokens, clearTokens } from "@/lib/api";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderAuditPage(initialUrl = "/audit") {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/audit" element={<AuditPage />} />
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

const SUMMARY = {
  criticalCount: 1,
  warningCount: 2,
  infoCount: 5,
  generatedAt: "2026-09-25T14:00:00.000Z",
};

const CRITICAL_EVENT = {
  id: "log-1",
  occurredAt: "2026-09-24T15:30:00.000Z",
  actorEmail: "maria@test.ni",
  actorRef: null,
  action: "ONBOARDING_ACTIVATION_CHECK_FAILED",
  severity: "CRITICAL",
  targetType: "ActivationAttempt",
  targetId: "attempt-uuid-1",
};

const INFO_EVENT = {
  id: "log-2",
  occurredAt: "2026-09-24T10:00:00.000Z",
  actorEmail: null,
  actorRef: "SYSTEM_RECONCILER",
  action: "UPDATE",
  severity: "INFO",
  targetType: "product",
  targetId: "product-uuid-2",
};

const WARNING_EVENT = {
  id: "log-3",
  occurredAt: "2026-09-23T18:45:00.000Z",
  actorEmail: "juan@test.ni",
  actorRef: null,
  action: "DEACTIVATE",
  severity: "WARNING",
  targetType: "product",
  targetId: "product-uuid-3",
};

const EVENTS = {
  events: [CRITICAL_EVENT, INFO_EVENT, WARNING_EVENT],
  generatedAt: "2026-09-25T14:00:00.000Z",
};

let fetchSpy: ReturnType<typeof vi.fn>;

function mockFetchOk(events: unknown = EVENTS) {
  fetchSpy.mockImplementation(async (url: string) => {
    if (String(url).includes("/operations/audit/summary")) {
      return new Response(JSON.stringify(SUMMARY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// --- S4b: POS forensic ledger surface (GET /operations/audit/ledger) ---

const LEDGER_ENTRY_CRITICAL = {
  id: "led-1",
  occurredAt: "2026-09-24T15:30:00.000Z",
  actorEmail: "maria@test.ni",
  actorUserId: "u-9",
  action: "SALE_VOIDED",
  severity: "CRITICAL",
  targetType: "invoice",
  targetId: "inv-uuid-1",
  deviceId: "pos-01",
  sequenceNo: 42,
};

const LEDGER_ENTRY_WARNING = {
  id: "led-2",
  occurredAt: "2026-09-24T16:45:00.000Z",
  actorEmail: "juan@test.ni",
  actorUserId: "u-10",
  action: "DRAWER_OPENED_MANUALLY",
  severity: "WARNING",
  targetType: null,
  targetId: null,
  deviceId: "pos-02",
  sequenceNo: 7,
};

const LEDGER_OK = {
  entries: [LEDGER_ENTRY_CRITICAL, LEDGER_ENTRY_WARNING],
  limit: 50,
  truncated: false,
  generatedAt: "2026-09-25T14:00:00.000Z",
};

const USERS_OK = [
  {
    id: "u-9",
    email: "maria@test.ni",
    name: "María",
    role: "CASHIER",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "u-10",
    email: "juan@test.ni",
    name: "Juan",
    role: "CASHIER",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

function mockLedgerFetchOk(
  options: {
    ledger?: unknown;
    integrity?: unknown;
    integrityStatus?: number;
    users?: unknown;
  } = {},
) {
  fetchSpy.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes("/operations/audit/integrity")) {
      return new Response(
        JSON.stringify(
          options.integrity ?? {
            alerts: [],
            generatedAt: "2026-09-25T03:00:00.000Z",
          },
        ),
        {
          status: options.integrityStatus ?? 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (u.includes("/identity/users")) {
      return new Response(JSON.stringify(options.users ?? USERS_OK), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(options.ledger ?? LEDGER_OK), {
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
  mockFetchOk();
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

describe("Audit page (batch 6 slice 6b — finding H6)", () => {
  it("renders the heading, summary strip counts and the event table columns", async () => {
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Auditoría" })).toBeInTheDocument();
    expect(screen.getByText("Eventos críticos")).toBeInTheDocument();
    expect(screen.getByText("Advertencias")).toBeInTheDocument();
    expect(screen.getByText("Informativos")).toBeInTheDocument();
    expect(screen.getByText("Fecha y hora")).toBeInTheDocument();
    expect(screen.getByText("Usuario")).toBeInTheDocument();
    expect(screen.getByText("Acción")).toBeInTheDocument();
    expect(screen.getByText("Severidad")).toBeInTheDocument();
    expect(screen.getByText("Referencia")).toBeInTheDocument();
  });

  it("renders event rows with human labels, canonical severity vocabulary and explicit datetimes (§26/§38)", async () => {
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    });

    // Human actors show their identity; logical actors get a human label.
    expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    expect(screen.getByText("Conciliación automática")).toBeInTheDocument();

    // Actions are localized — never raw machine codes (§39.4).
    expect(screen.getByText("Fallo de control en activación de terminal")).toBeInTheDocument();
    expect(screen.getByText("Modificación")).toBeInTheDocument();
    expect(screen.getByText("Desactivación")).toBeInTheDocument();

    // Severity uses the canonical vocabulary, color is not the only signal.
    // "Crítico" also labels the severity filter chip, so multiple matches are
    // expected; the badge text itself must exist.
    expect(screen.getAllByText("Crítico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Advertencia").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Informativo").length).toBeGreaterThan(0);

    // §38: auditable history shows explicit date + time, never relative-only.
    // (Test env and app pin America/Managua; Intl inserts a narrow no-break
    // space before the meridiem, so match with a regex.)
    expect(screen.getByText(/24\/09\/2026.*09:30.*a\./)).toBeInTheDocument();

    // Entity types are named; internal ids are not rendered (§12.2).
    expect(screen.getByText("Activación de terminal")).toBeInTheDocument();
    expect(screen.getAllByText("Producto").length).toBeGreaterThan(0);
    expect(screen.queryByText("attempt-uuid-1")).not.toBeInTheDocument();
  });

  it("never renders raw UPPERCASE_SNAKE codes in visible copy (§39.4)", async () => {
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    });

    expect(screen.queryByText("ONBOARDING_ACTIVATION_CHECK_FAILED")).not.toBeInTheDocument();
    expect(screen.queryByText("DEACTIVATE")).not.toBeInTheDocument();
    expect(screen.queryByText("SYSTEM_RECONCILER")).not.toBeInTheDocument();
    expect(screen.queryByText("ActivationAttempt")).not.toBeInTheDocument();
    expect(screen.queryByText("CRITICAL")).not.toBeInTheDocument();
    expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
  });

  it("renders the report generation time as freshness metadata, never as sync truth (§35)", async () => {
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByTestId("freshness-badge")).toBeInTheDocument();
    });
    expect(screen.getByTestId("freshness-badge")).toHaveTextContent("Actualizado");
  });

  it("consumes the deep-link context: severity and period become visible filter chips and reach the API (§9/§14.4)", async () => {
    renderAuditPage(
      "/audit?source=dashboard&sourceWidget=attention&startDate=2026-08-01&endDate=2026-08-31&severity=CRITICAL",
    );

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some(
          (u) =>
            u.includes("/operations/audit/events") &&
            u.includes("severity=CRITICAL") &&
            u.includes("startDate=2026-08-01") &&
            u.includes("endDate=2026-08-31"),
        ),
      ).toBe(true);
    });

    // The deep-linked filters are VISIBLE as chips (AP-13), with the
    // severity chip selected and the period chip clearable.
    const criticalChip = screen.getByRole("button", { name: "Crítico" });
    expect(criticalChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Período: 2026-08-01 – 2026-08-31/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar filtro de período" }),
    ).toBeInTheDocument();
  });

  it("sends an explicit page cap to the backend (§15)", async () => {
    renderAuditPage();

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some(
          (u) => u.includes("/operations/audit/events") && u.includes("limit=50"),
        ),
      ).toBe(true);
    });
  });

  it("renders a loading state before data arrives", async () => {
    fetchSpy.mockImplementation(() => new Promise(() => undefined));
    renderAuditPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cargando eventos de auditoría",
    );
    expect(screen.queryByText("Fecha y hora")).not.toBeInTheDocument();
  });

  it("renders an error state with a meaningful message and retry", async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes("/operations/audit/summary")) {
        return new Response(JSON.stringify(SUMMARY), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByText(/Error en el servidor/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("recovers through the retry button after a transient failure", async () => {
    const user = userEvent.setup();
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes("/operations/audit/summary")) {
        return new Response(JSON.stringify(SUMMARY), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderAuditPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });

    mockFetchOk();
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));

    await waitFor(() => {
      expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    });
  });

  it("renders the first-use empty state when the tenant has no events", async () => {
    mockFetchOk({ events: [], generatedAt: SUMMARY.generatedAt });
    renderAuditPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Todavía no hay eventos registrados/i),
      ).toBeInTheDocument();
    });
  });

  it("renders the filtered empty state with a reset action when the filters return nothing (§13.2/§29)", async () => {
    mockFetchOk({ events: [], generatedAt: SUMMARY.generatedAt });
    renderAuditPage("/audit?severity=CRITICAL");

    await waitFor(() => {
      expect(
        screen.getByText(/No hay eventos con estos filtros/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Ver todos los eventos/ }),
    ).toBeInTheDocument();
  });

  it("keeps the summary strip honest when only the summary read fails (§28.2/§34)", async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes("/operations/audit/summary")) {
        return new Response(JSON.stringify({}), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(EVENTS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    renderAuditPage();

    // The event list still renders; the failed summary is named, and the
    // counts are unknown (—), never a fabricated 0.
    await waitFor(() => {
      expect(screen.getByText("maria@test.ni")).toBeInTheDocument();
    });
    expect(screen.getByText(/No pudimos cargar el resumen/)).toBeInTheDocument();
  });

  it("gates the route by role: OWNER and MANAGER can access, CASHIER and WAITER cannot", () => {
    // Mirrors the backend @Roles(OWNER, MANAGER) on GET /operations/audit/*;
    // the same rbac gate drives both the ProtectedRoute and the sidebar.
    expect(canAccessRoute("OWNER", "/audit")).toBe(true);
    expect(canAccessRoute("MANAGER", "/audit")).toBe(true);
    expect(canAccessRoute("CASHIER", "/audit")).toBe(false);
    expect(canAccessRoute("WAITER", "/audit")).toBe(false);
  });

  it("preserves the deep-link href contract built by the attention band (dashboard-v2-attention.spec.tsx)", async () => {
    // The attention band builds /audit?source=dashboard&sourceWidget=attention
    // (plus period + severity). This page is the consumer of that contract;
    // the param names it reads must keep matching what the band emits.
    renderAuditPage(
      "/audit?source=dashboard&sourceWidget=attention&startDate=2026-08-01&endDate=2026-08-31&severity=WARNING",
    );

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some((u) => u.includes("severity=WARNING")),
      ).toBe(true);
    });
    const warningChip = screen.getByRole("button", { name: "Advertencia" });
    expect(warningChip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Audit page — POS ledger surface (S4b)", () => {
  it("renders the ledger with actor, action, entity, device and severity, and never calls the platform events endpoint", async () => {
    mockLedgerFetchOk();
    renderAuditPage("/audit?view=ledger");

    // The actor email also labels a filter option, so anchor on the table
    // row via the localized action text.
    await waitFor(() => {
      expect(screen.getByText("Anulación de factura")).toBeInTheDocument();
    });
    const criticalRow = screen.getByText("Anulación de factura").closest("tr");
    expect(criticalRow).toHaveTextContent("maria@test.ni");
    expect(screen.queryByText("SALE_VOIDED")).not.toBeInTheDocument();
    // Entity type is named in human language (the filter option shares the
    // label, so scope the assertion to the table row).
    expect(within(criticalRow as HTMLElement).getByText("Factura")).toBeInTheDocument();
    // Device column exists and shows which terminal produced the entry.
    expect(screen.getByText("pos-01")).toBeInTheDocument();
    expect(screen.getByText("Dispositivo")).toBeInTheDocument();
    expect(screen.getAllByText("Crítico").length).toBeGreaterThan(0);

    // Two separated sources: the ledger view must not silently read the
    // change_log store, and it sends the explicit page cap.
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(
      calls.some((u) => u.includes("/operations/audit/ledger") && u.includes("limit=50")),
    ).toBe(true);
    expect(calls.some((u) => u.includes("/operations/audit/events"))).toBe(false);

    // The response was NOT truncated (2 < 50), so no incompleteness warning.
    expect(
      screen.queryByText(/puede haber más registros/i),
    ).not.toBeInTheDocument();
  });

  it("forwards the actor and entity filters to the ledger API and shows them as clearable chips (§14)", async () => {
    const user = userEvent.setup();
    mockLedgerFetchOk();
    renderAuditPage("/audit?view=ledger");

    const actorSelect = await screen.findByLabelText("Filtrar por actor");
    // Wait until the users read resolved and the actor options exist.
    await screen.findByRole("option", { name: "maria@test.ni" });
    await user.selectOptions(actorSelect, "u-9");

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some(
          (u) =>
            u.includes("/operations/audit/ledger") && u.includes("actorUserId=u-9"),
        ),
      ).toBe(true);
    });
    // The active filter is visible with its human identity and clearable.
    expect(screen.getByText(/Actor: maria@test.ni/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar filtro de actor" }),
    ).toBeInTheDocument();

    const entitySelect = screen.getByLabelText("Filtrar por entidad");
    await user.selectOptions(entitySelect, "invoice");

    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(
        calls.some(
          (u) =>
            u.includes("/operations/audit/ledger") && u.includes("targetType=invoice"),
        ),
      ).toBe(true);
    });
    expect(screen.getByText(/Entidad: Factura/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quitar filtro de entidad" }),
    ).toBeInTheDocument();
  });

  it("shows an honest truncation notice when the ledger API reports truncated (§15)", async () => {
    mockLedgerFetchOk({ ledger: { ...LEDGER_OK, truncated: true } });
    renderAuditPage("/audit?view=ledger");

    await waitFor(() => {
      expect(screen.getByText("Anulación de factura")).toBeInTheDocument();
    });
    // The honest flag — not the row count — drives the notice.
    expect(
      screen.getByText(/puede haber más registros/i),
    ).toBeInTheDocument();
  });

  it("distinguishes a FAILED integrity check from a genuine no-alerts result (§34)", async () => {
    mockLedgerFetchOk({ integrityStatus: 500 });
    renderAuditPage("/audit?view=ledger");

    await waitFor(() => {
      expect(
        screen.getByText(/Error en el servidor/),
      ).toBeInTheDocument();
    });
    // A failure must never be dressed as a clean result.
    expect(
      screen.queryByText(/no registró huecos/i),
    ).not.toBeInTheDocument();
    // Meaningful retry, scoped to the integrity read.
    expect(
      screen.getByRole("button", { name: /Reintentar/ }),
    ).toBeInTheDocument();
  });

  it("renders the genuine empty integrity result as a nightly-check report, not an absolute guarantee", async () => {
    mockLedgerFetchOk();
    renderAuditPage("/audit?view=ledger");

    await waitFor(() => {
      expect(
        screen.getByText(/no registró huecos/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/No pudimos cargar la verificación de integridad/i),
    ).not.toBeInTheDocument();
  });

  it("visibly distinguishes severity with the page's badge conventions (color is never the only signal, §46)", async () => {
    mockLedgerFetchOk();
    renderAuditPage("/audit?view=ledger");

    await waitFor(() => {
      expect(screen.getByText("Anulación de factura")).toBeInTheDocument();
    });

    const criticalRow = screen
      .getByText("Anulación de factura")
      .closest("tr");
    expect(criticalRow).not.toBeNull();
    const criticalBadge = within(criticalRow as HTMLElement).getByText("Crítico");
    expect(criticalBadge.className).toContain("bg-red-50");

    const warningRow = screen
      .getByText("Apertura manual de gaveta")
      .closest("tr");
    expect(warningRow).not.toBeNull();
    const warningBadge = within(warningRow as HTMLElement).getByText("Advertencia");
    expect(warningBadge.className).toContain("bg-amber-50");
  });
});
