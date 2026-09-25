/**
 * D-21 (#554) — DGI authorization letter data in the owner dashboard
 * fiscal setup form (work unit U5).
 *
 * Backend contract (apps/admin_backend FiscalSetupDto):
 * - dgiAuthorizationCode: optional, <= 50 chars, charset letters/digits/
 *   hyphens/slashes ONLY (no structural mask — DGI's format is not
 *   documented). '' clears the stored code via a null tombstone.
 * - dgiAuthorizationIssuedAt / dgiAuthorizationExpiresAt: optional ISO-8601;
 *   when both are present, expiresAt >= issuedAt.
 *
 * Owner decision (D-21): expiry warning lead time is FIXED at 30 days.
 * Absence (no date / corrupt date) renders NO banner — absence looks like
 * absence. The banner is informational and never blocks saving.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FiscalSetupForm } from "@/features/settings/fiscal-setup-form";
import {
  fiscalSetupSchema,
  resolveDgiAuthorizationExpiryStatus,
  FiscalRegime,
} from "@/features/settings/types";
import { setTokens, clearTokens } from "@/lib/api";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// --- Schema-level tests (mirror the backend FiscalSetupDto boundary) ---

const baseValues = () => ({
  regime: FiscalRegime.CUOTA_FIJA,
  businessName: "Comedor Doña Mary",
  ruc: "J0310000055555",
  commercialFxSpread: 0.5,
  pricesIncludeTax: true,
});

describe("fiscalSetupSchema — DGI authorization code (D-21, #554)", () => {
  it("accepts a payload without DGI authorization fields", () => {
    const result = fiscalSetupSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it.each([
    ["DGI-style reference", "DGI-SFC-2024-00123"],
    ["resolution-style reference with slash", "RES-SFC-145/2025"],
  ])("accepts a %s", (_label, code) => {
    const result = fiscalSetupSchema.safeParse({ ...baseValues(), dgiAuthorizationCode: code });
    expect(result.success).toBe(true);
  });

  it("accepts a 50-character code at the length ceiling", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationCode: "A".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty code so the clear path stays reachable", () => {
    const result = fiscalSetupSchema.safeParse({ ...baseValues(), dgiAuthorizationCode: "" });
    expect(result.success).toBe(true);
  });

  it("rejects a 51-character code", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationCode: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["internal spaces", "DGI SFC 2024"],
    ["underscores", "RES_SFC_2025"],
    ["non-ASCII letters", "RESOLUCIÓN-2025"],
  ])("rejects a code with %s", (_label, code) => {
    const result = fiscalSetupSchema.safeParse({ ...baseValues(), dgiAuthorizationCode: code });
    expect(result.success).toBe(false);
  });
});

describe("fiscalSetupSchema — DGI authorization date pair (D-21, #554)", () => {
  it("accepts a valid issuedAt/expiresAt pair", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationIssuedAt: "2025-01-15",
      dgiAuthorizationExpiresAt: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an expiresAt equal to issuedAt", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationIssuedAt: "2025-01-15",
      dgiAuthorizationExpiresAt: "2025-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts both dates blank", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationIssuedAt: "",
      dgiAuthorizationExpiresAt: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects issuedAt without expiresAt, pointing at dgiAuthorizationExpiresAt", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationIssuedAt: "2025-01-15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("dgiAuthorizationExpiresAt"))).toBe(true);
    }
  });

  it("rejects expiresAt without issuedAt, pointing at dgiAuthorizationIssuedAt", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationExpiresAt: "2026-01-15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("dgiAuthorizationIssuedAt"))).toBe(true);
    }
  });

  it("rejects an expiresAt earlier than issuedAt", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      dgiAuthorizationIssuedAt: "2025-01-15",
      dgiAuthorizationExpiresAt: "2024-01-15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("dgiAuthorizationExpiresAt"))).toBe(true);
    }
  });
});

// --- Expiry warning status (fixed 30-day lead, owner decision D-21) ---

describe("resolveDgiAuthorizationExpiryStatus", () => {
  // Local-time noon so the day arithmetic never straddles midnight.
  const now = new Date(2026, 5, 15, 12, 0, 0);

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a corrupt date", "not-a-date"],
  ])("resolves to no banner for %s", (_label, expiresAt) => {
    const status = resolveDgiAuthorizationExpiryStatus(
      expiresAt as string | null | undefined,
      now,
    );
    expect(status.state).toBe("none");
  });

  it("warns when the expiry is exactly 30 days out (boundary)", () => {
    const status = resolveDgiAuthorizationExpiryStatus("2026-07-15", now);
    expect(status.state).toBe("warning");
    expect(status.daysUntilExpiry).toBe(30);
  });

  it("does not warn when the expiry is 31 days out", () => {
    const status = resolveDgiAuthorizationExpiryStatus("2026-07-16", now);
    expect(status.state).toBe("none");
    expect(status.daysUntilExpiry).toBe(31);
  });

  it("warns when the expiry is today", () => {
    const status = resolveDgiAuthorizationExpiryStatus("2026-06-15", now);
    expect(status.state).toBe("warning");
    expect(status.daysUntilExpiry).toBe(0);
  });

  it("reports expired when the expiry is in the past", () => {
    const status = resolveDgiAuthorizationExpiryStatus("2026-06-14", now);
    expect(status.state).toBe("expired");
  });
});

// --- Component-level tests (FiscalSetupForm) ---

const fiscalGetResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      tenantId: "tenant-d21-1",
      businessName: "Café París",
      ruc: "J0310000012345",
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const fiscalPostResponse = () =>
  new Response(
    JSON.stringify({
      tenantId: "tenant-d21-1",
      businessName: "Café París",
      ruc: "J0310000012345",
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

async function renderLoadedForm(getOverrides: Record<string, unknown> = {}) {
  fetchSpy.mockResolvedValueOnce(fiscalGetResponse(getOverrides));
  render(
    <TestWrapper>
      <FiscalSetupForm />
    </TestWrapper>,
  );
  await waitFor(() => {
    expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
  });
}

describe("FiscalSetupForm — DGI authorization fields (D-21, #554)", () => {
  it("renders the code and date fields with helper text and placeholder", async () => {
    await renderLoadedForm();

    expect(screen.getByLabelText(/Código de Autorización DGI/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha de Emisión/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha de Vencimiento/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("DGI-SFC-2024-00123")).toBeInTheDocument();
    expect(screen.getByText(/El formato exacto es el de la carta de autorización/i)).toBeInTheDocument();
  });

  it("prefills the saved authorization data from the snapshot", async () => {
    await renderLoadedForm({
      dgiAuthorizationCode: "DGI-SFC-2024-00123",
      dgiAuthorizationIssuedAt: "2025-01-15",
      dgiAuthorizationExpiresAt: "2026-07-15",
    });

    expect(screen.getByDisplayValue("DGI-SFC-2024-00123")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2025-01-15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-07-15")).toBeInTheDocument();
  });

  it("rejects a 51-character code at submit and does not POST", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    const codeInput = screen.getByLabelText(/Código de Autorización DGI/i);
    fireEvent.change(codeInput, { target: { value: "A".repeat(51) } });

    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      expect(screen.getByText(/no debe exceder 50 caracteres/i)).toBeInTheDocument();
    });
    const postCalls = fetchSpy.mock.calls.filter(
      ([url, init]) => String(url).endsWith("/onboarding/fiscal-setup") && init?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  it("rejects a code with a space at submit", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Código de Autorización DGI/i), "DGI SFC 2024");
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      expect(
        screen.getByText(/solo admite letras, números, guiones y barras/i),
      ).toBeInTheDocument();
    });
  });

  it("accepts RES-SFC-145/2025 and posts all three authorization fields", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Código de Autorización DGI/i), "RES-SFC-145/2025");
    fireEvent.change(screen.getByLabelText(/Fecha de Emisión/i), {
      target: { value: "2025-01-15" },
    });
    fireEvent.change(screen.getByLabelText(/Fecha de Vencimiento/i), {
      target: { value: "2026-01-15" },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/onboarding/fiscal-setup") && init?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
      const body = JSON.parse(postCalls[0]![1]!.body as string);
      expect(body.dgiAuthorizationCode).toBe("RES-SFC-145/2025");
      expect(body.dgiAuthorizationIssuedAt).toBe("2025-01-15");
      expect(body.dgiAuthorizationExpiresAt).toBe("2026-01-15");
    });
  });

  it("sends an empty code and omits blank dates on submit", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    // Make a retained change so the form is dirty (RHF's isDirty is
    // live-recomputed: typing and clearing the code alone would return the
    // form to its default values and keep the save button disabled). The
    // empty code remains meaningful: the backend clears it via tombstone.
    fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
      target: { value: "Café París S.A." },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/onboarding/fiscal-setup") && init?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
      const body = JSON.parse(postCalls[0]![1]!.body as string);
      expect(body.dgiAuthorizationCode).toBe("");
      expect("dgiAuthorizationIssuedAt" in body).toBe(false);
      expect("dgiAuthorizationExpiresAt" in body).toBe(false);
    });
  });
});

describe("FiscalSetupForm — DGI authorization expiry banner (D-21, #554)", () => {
  // Fixed "today" so the 30-day lead is deterministic.
  const fixedNow = new Date(2026, 5, 15, 12, 0, 0);

  function renderWithExpiry(expiresAt: string | null | undefined) {
    vi.setSystemTime(fixedNow);
    return renderLoadedForm({
      dgiAuthorizationCode: "DGI-SFC-2024-00123",
      dgiAuthorizationExpiresAt: expiresAt ?? null,
    });
  }

  it("shows the warning banner when the expiry is within 30 days", async () => {
    await renderWithExpiry("2026-07-10");
    await waitFor(() => {
      expect(screen.getByTestId("dgi-authorization-expiry-warning")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("dgi-authorization-expired-warning")).not.toBeInTheDocument();
  });

  it("shows the warning banner at the 30-day boundary", async () => {
    await renderWithExpiry("2026-07-15");
    await waitFor(() => {
      expect(screen.getByTestId("dgi-authorization-expiry-warning")).toBeInTheDocument();
    });
  });

  it("shows no banner when the expiry is 31 days out", async () => {
    await renderWithExpiry("2026-07-16");
    await waitFor(() => {
      expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("dgi-authorization-expiry-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dgi-authorization-expired-warning")).not.toBeInTheDocument();
  });

  it("shows the stronger expired banner when the expiry is in the past", async () => {
    await renderWithExpiry("2026-06-01");
    await waitFor(() => {
      expect(screen.getByTestId("dgi-authorization-expired-warning")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("dgi-authorization-expiry-warning")).not.toBeInTheDocument();
  });

  it("shows no banner when no expiry is saved", async () => {
    await renderWithExpiry(null);
    await waitFor(() => {
      expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("dgi-authorization-expiry-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dgi-authorization-expired-warning")).not.toBeInTheDocument();
  });

  it("shows no banner for a corrupt saved expiry date", async () => {
    await renderWithExpiry("not-a-date");
    await waitFor(() => {
      expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("dgi-authorization-expiry-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dgi-authorization-expired-warning")).not.toBeInTheDocument();
  });
});
