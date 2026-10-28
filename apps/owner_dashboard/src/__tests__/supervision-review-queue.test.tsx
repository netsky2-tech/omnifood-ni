/**
 * The owner's REVIEW QUEUE for the tenant's supervision policy
 * (GET /operations/audit/supervision-review).
 *
 * These specs pin the three things the queue must never get wrong:
 *
 *  - it answers the question the policy exists for (who signed it, with
 *    which credential, and was a supervisor involved) in the OWNER's words,
 *    never in the terminal's codes;
 *  - it distinguishes "nothing happened" from "we could not load it" (§16:
 *    unknown is `—`, not `0`), and a zero count reads as `—`, not as a
 *    number that looks like a measurement;
 *  - it is honest about truncation instead of implying completeness.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "@/features/audit/audit-page";
import { useAuthStore } from "@/features/auth/auth-store";
import { setTokens, clearTokens } from "@/lib/api";

function renderAuditPage(initialUrl = "/audit?view=supervision") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
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

const REVIEW_ENTRY_SELF = {
  occurredAt: "2026-09-24T15:30:00.000Z",
  actorEmail: "cajero@tenant.test",
  authorizerEmail: "cajero@tenant.test",
  hadSupervisor: false,
  method: "PIN",
  flow: "CLOSE_BOX",
  action: "SELF_AUTHORIZED_CLOSE_SESSION",
  severity: "CRITICAL",
  deviceId: "pos-01",
};

const REVIEW_ENTRY_SUPERVISED = {
  occurredAt: "2026-09-24T18:45:00.000Z",
  actorEmail: "cajero@tenant.test",
  authorizerEmail: "gerente@tenant.test",
  hadSupervisor: true,
  method: "TOTP",
  flow: "MANUAL_DISCOUNT",
  action: "SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT",
  severity: "CRITICAL",
  deviceId: "pos-01",
};

const REVIEW_OK = {
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  total: 4,
  selfAuthorizedTotal: 3,
  byClass: [
    { flow: "CLOSE_BOX", supervised: 0, selfAuthorized: 2 },
    { flow: "MANUAL_DISCOUNT", supervised: 1, selfAuthorized: 1 },
  ],
  entries: [REVIEW_ENTRY_SELF, REVIEW_ENTRY_SUPERVISED],
  limit: 50,
  truncated: false,
  generatedAt: "2026-09-30T14:00:00.000Z",
};

let fetchSpy: ReturnType<typeof vi.fn>;

function mockReview(body: unknown, status = 200) {
  fetchSpy.mockImplementation(async (url: string) => {
    if (String(url).includes("/operations/audit/supervision-review")) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    // The other audit reads answer empty so the view under test is the only
    // one with content.
    return new Response(JSON.stringify({ events: [], entries: [], alerts: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "jwt-test", refreshToken: "refresh-test" });
  useAuthStore.setState({
    user: {
      id: "u-1",
      name: "Operador",
      role: "OWNER",
      email: "op@test.ni",
      active: true,
      tenantId: "tenant-1",
    },
    tenant: {
      id: "tenant-1",
      name: "Test",
      slug: "test",
      ruc: "",
      active: true,
    },
    isAuthenticated: true,
    hydrated: true,
  });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe("Supervision review queue", () => {
  it("answers the question the policy exists for, in the owner's words", async () => {
    mockReview(REVIEW_OK);

    renderAuditPage();

    // The counts come first, and the headline is the number to review.
    expect(await screen.findByText(/3 la firmó el propio operador/i)).toBeInTheDocument();
    // The flow reads as a business operation, never as a code.
    // The flow reads as a business operation, never as a code: it appears in
    // the summary AND in the row, and both say the same thing.
    expect(screen.getAllByText("Cierre de turno (Corte Z)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Descuento manual").length).toBeGreaterThan(0);
    // Who operated, who signed, and with which credential.
    expect(screen.getByText("El propio operador")).toBeInTheDocument();
    expect(screen.getByText("gerente@tenant.test")).toBeInTheDocument();
    expect(screen.getByText("PIN del operador")).toBeInTheDocument();
    expect(screen.getByText("Código TOTP")).toBeInTheDocument();
    // The forensic code never reaches the screen.
    expect(screen.queryByText("SELF_AUTHORIZED_CLOSE_SESSION")).toBeNull();
  });

  it("reads a zero count as an absence, not as a measurement", async () => {
    mockReview(REVIEW_OK);

    renderAuditPage();

    await screen.findByText(/3 la firmó el propio operador/i);
    // The gaveta never happened in this period: the count reads as "—".
    const gaveta = screen.getByText("Apertura de gaveta").closest("div");
    expect(gaveta?.textContent).toContain("—");
  });

  it("distinguishes 'nothing happened' from 'we could not load it'", async () => {
    mockReview({ entries: [], total: 0, selfAuthorizedTotal: 0, byClass: [] });

    renderAuditPage();

    expect(
      await screen.findByTestId("supervision-review-empty"),
    ).toHaveTextContent(/no se firmó ninguna operación sensible/i);
  });

  it("explains a failed load in plain words and keeps a retry available", async () => {
    // A failure WITHOUT a server message: the dashboard must not leak the
    // technical status, and it must offer the retry.
    mockReview({}, 500);

    renderAuditPage();

    // The house copy for a server failure — never "API error: 500".
    expect(
      await screen.findByText(/Error en el servidor/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/API error/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("is honest about truncation instead of implying completeness", async () => {
    mockReview({ ...REVIEW_OK, total: 42, truncated: true });

    renderAuditPage();

    expect(
      await screen.findByText(/Se muestran las primeras 2 de 42 operaciones/i),
    ).toBeInTheDocument();
  });

  it("is reachable from the audit page as its own source", async () => {
    mockReview(REVIEW_OK);

    renderAuditPage("/audit");

    const chip = await screen.findByTestId("audit-view-supervision");
    await userEvent.click(chip);

    await waitFor(() =>
      expect(
        screen.getAllByText(/Las operaciones sensibles que se firmaron/i).length,
      ).toBeGreaterThan(0),
    );
  });
});
