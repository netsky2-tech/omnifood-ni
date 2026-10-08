/**
 * BXW-007 U2 (contract rev 2) — Business Profile fields (operation mode +
 * checkout FX mode) in the owner dashboard fiscal setup form.
 *
 * Contract rev 2: the fields are OPTIONAL-UNTIL-SET. The GET snapshot types
 * them `TenantOperationMode | null` / `CheckoutFxMode | null` where null =
 * "never configured in the cloud". The form NEVER preselects a default:
 * preselecting one would make ANY save (e.g. editing only the spread)
 * affirm a mode explicitly and silently downgrade terminals an operator
 * set to RESTAURANT/HYBRID locally. Absence is sent as absence — the key
 * is omitted from the POST body, never sent as '' nor as a default.
 *
 * A PRESENT value must be a valid wire literal (backend FiscalSetupDto
 * IsEnum + ValidationPipe forbidNonWhitelisted).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FiscalSetupForm } from "@/features/settings/fiscal-setup-form";
import {
  CheckoutFxMode,
  fiscalSetupSchema,
  FiscalRegime,
  TenantOperationMode,
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
});

// --- Schema-level tests (mirror the backend FiscalSetupDto boundary) ---

const baseValues = () => ({
  regime: FiscalRegime.CUOTA_FIJA,
  businessName: "Comedor Doña Mary",
  ruc: "J0310000055555",
  commercialFxSpread: 36.5,
  pricesIncludeTax: true,
});

describe("fiscalSetupSchema — Business Profile fields (BXW-007 U2, rev 2)", () => {
  it("accepts a payload carrying both fields as valid literals", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      operationMode: TenantOperationMode.RESTAURANT,
      checkoutFxMode: CheckoutFxMode.BCN_OFFICIAL,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload without the fields (absence = never configured)", () => {
    const result = fiscalSetupSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
  });

  it("accepts explicit null (never configured in the cloud)", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      operationMode: null,
      checkoutFxMode: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the '' sentinel of the 'Sin definir' select option", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      operationMode: "",
      checkoutFxMode: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // The sentinel normalizes to absence before the wire.
      expect(result.data.operationMode).toBeUndefined();
      expect(result.data.checkoutFxMode).toBeUndefined();
    }
  });

  it("rejects an operationMode outside the POS canon vocabulary", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      operationMode: "CAFETERIA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a checkoutFxMode outside the POS canon vocabulary", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      checkoutFxMode: "SPREAD_PLUS_10",
    });
    expect(result.success).toBe(false);
  });

  it("reports a Spanish error message ONLY for an invalid operationMode member", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      operationMode: "CAFETERIA",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("operationMode"));
      expect(issue?.message).toMatch(/modo de operación/i);
    }
  });

  it("reports a Spanish error message ONLY for an invalid checkoutFxMode member", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      checkoutFxMode: "SPREAD_PLUS_10",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("checkoutFxMode"));
      expect(issue?.message).toMatch(/tasa de cambio/i);
    }
  });
});

// --- Schema-level tests: manual discount caps (SOHO P3, D-A) ---
// "Sin configurar = sin tope": absence (undefined, null, "" or NaN from an
// emptied number input) is valid and means the POS applies NO cap. A PRESENT
// value must satisfy the backend FiscalSetupDto ranges (amount >= 0; percent
// > 0 and <= 100).
describe("fiscalSetupSchema — manual discount caps (SOHO P3, D-A)", () => {
  it("accepts a payload carrying valid caps", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      maxDiscountAmount: 500,
      maxDiscountPercent: 15,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload without the caps (sin configurar = sin tope)", () => {
    const result = fiscalSetupSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDiscountAmount).toBeUndefined();
      expect(result.data.maxDiscountPercent).toBeUndefined();
    }
  });

  it("accepts the '' sentinel and normalizes it to absence", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      maxDiscountAmount: "",
      maxDiscountPercent: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDiscountAmount).toBeUndefined();
      expect(result.data.maxDiscountPercent).toBeUndefined();
    }
  });

  it("accepts NaN (what valueAsNumber yields for an emptied input) as absence", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      maxDiscountAmount: Number.NaN,
      maxDiscountPercent: Number.NaN,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDiscountAmount).toBeUndefined();
      expect(result.data.maxDiscountPercent).toBeUndefined();
    }
  });

  it("accepts an amount of 0 (a zero-amount cap forbids manual discounts)", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      maxDiscountAmount: 0,
    });
    expect(result.success).toBe(true);
    // Regression net against falsy coercion: 0 must survive parsing as the
    // number 0 ("forbid manual discounts"), never undefined and never null.
    if (result.success) {
      expect(result.data.maxDiscountAmount).toBe(0);
      expect(result.data.maxDiscountAmount).not.toBeUndefined();
      expect(result.data.maxDiscountAmount).not.toBeNull();
    }
  });

  it("rejects a negative amount with a Spanish message", () => {
    const result = fiscalSetupSchema.safeParse({
      ...baseValues(),
      maxDiscountAmount: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("maxDiscountAmount"));
      expect(issue?.message).toMatch(/monto máximo de descuento/i);
    }
  });

  it("rejects a percent of 0 or above 100 with a Spanish message", () => {
    for (const percent of [0, 100.5]) {
      const result = fiscalSetupSchema.safeParse({
        ...baseValues(),
        maxDiscountPercent: percent,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("maxDiscountPercent"));
        expect(issue?.message).toMatch(/porcentaje máximo de descuento/i);
      }
    }
  });
});

// --- Component-level tests (FiscalSetupForm) ---

const fiscalGetResponse = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      tenantId: "tenant-bxw007-2",
      businessName: "Café París",
      ruc: "J0310000012345",
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 36.5,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const fiscalPostResponse = () =>
  new Response(
    JSON.stringify({
      tenantId: "tenant-bxw007-2",
      businessName: "Café París",
      ruc: "J0310000012345",
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 36.5,
      operationMode: null,
      checkoutFxMode: null,
      maxDiscountAmount: null,
      maxDiscountPercent: null,
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

const postedFiscalBodies = () =>
  fetchSpy.mock.calls
    .filter(
      ([url, init]) =>
        String(url).endsWith("/onboarding/fiscal-setup") && init?.method === "POST",
    )
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));

const operationSelect = () =>
  screen.getByLabelText(/Modo de Operación del Negocio/i) as HTMLSelectElement;
const fxSelect = () =>
  screen.getByLabelText(/Tasa de Cambio en Cobro en Divisas/i) as HTMLSelectElement;

describe("FiscalSetupForm — Business Profile selects (BXW-007 U2, rev 2)", () => {
  it("renders both selects on the 'Sin definir' sentinel when the GET response omits them", async () => {
    await renderLoadedForm();

    expect(operationSelect().value).toBe("");
    expect(fxSelect().value).toBe("");
    // One 'Sin definir' sentinel option per select.
    expect(
      screen.getAllByText(/Sin definir \(valor local de la terminal\)/i),
    ).toHaveLength(2);
  });

  it("keeps the 'Sin definir' sentinel when the GET response carries explicit nulls", async () => {
    await renderLoadedForm({ operationMode: null, checkoutFxMode: null });

    expect(operationSelect().value).toBe("");
    expect(fxSelect().value).toBe("");
  });

  it("preselects RESTAURANT + BCN_OFFICIAL when the GET response carries them", async () => {
    await renderLoadedForm({
      operationMode: TenantOperationMode.RESTAURANT,
      checkoutFxMode: CheckoutFxMode.BCN_OFFICIAL,
    });

    expect(operationSelect().value).toBe(TenantOperationMode.RESTAURANT);
    expect(fxSelect().value).toBe(CheckoutFxMode.BCN_OFFICIAL);
  });

  it("falls back to 'Sin definir' (never a default) on an invalid stored value", async () => {
    await renderLoadedForm({
      operationMode: "CAFETERIA_LEGACY",
      checkoutFxMode: "SPREAD_PLUS_10",
    });

    expect(operationSelect().value).toBe("");
    expect(fxSelect().value).toBe("");
  });

  it("sends RESTAURANT + BCN_OFFICIAL with the exact wire literals when chosen", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    await user.selectOptions(operationSelect(), TenantOperationMode.RESTAURANT);
    await user.selectOptions(fxSelect(), CheckoutFxMode.BCN_OFFICIAL);

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({
        operationMode: "RESTAURANT",
        checkoutFxMode: "BCN_OFFICIAL",
      });
    });
  });

  it("omits both keys from the POST when the GET carried null and nothing was chosen", async () => {
    await renderLoadedForm({ operationMode: null, checkoutFxMode: null });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
      target: { value: "Café París S.A." },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      // Absence is sent as absence — never '' nor a default.
      expect("operationMode" in bodies[0]).toBe(false);
      expect("checkoutFxMode" in bodies[0]).toBe(false);
    });
  });

  it("never sends the keys when saving only the spread with untouched selects (silent-downgrade guard)", async () => {
    await renderLoadedForm({
      operationMode: null,
      checkoutFxMode: null,
    });
    const user = userEvent.setup();

    // Edit ONLY the spread: the selects stay on 'Sin definir'. Any key in
    // the payload here would affirm a mode and downgrade local terminals.
    fireEvent.change(screen.getByLabelText(/Tipo de Cambio Comercial/i), {
      target: { value: "36.75" },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].commercialFxSpread).toBe(36.75);
      expect("operationMode" in bodies[0]).toBe(false);
      expect("checkoutFxMode" in bodies[0]).toBe(false);
    });
  });

  it("sends operationMode: null when a stored mode is reverted to 'Sin definir' (undo-real→null tombstone)", async () => {
    await renderLoadedForm({ operationMode: TenantOperationMode.HYBRID });
    const user = userEvent.setup();

    // The GET carried a REAL value; returning the select to the sentinel
    // must clear the stored value through a null tombstone so every
    // terminal regains its local control. Omitting the key here would
    // leave HYBRID governing forever (BXW-007 defect).
    await user.selectOptions(operationSelect(), TenantOperationMode.FOODPARK_QSR);
    await user.selectOptions(operationSelect(), "");

    fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
      target: { value: "Café París S.A." },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].operationMode).toBeNull();
      // checkoutFxMode was absent/null on the GET: untouched sentinel → omit.
      expect("checkoutFxMode" in bodies[0]).toBe(false);
    });
  });

  it("sends checkoutFxMode: null when a stored FX mode is reverted to 'Sin definir' (undo-real→null tombstone)", async () => {
    await renderLoadedForm({ checkoutFxMode: CheckoutFxMode.COMMERCIAL });
    const user = userEvent.setup();

    await user.selectOptions(fxSelect(), CheckoutFxMode.BCN_OFFICIAL);
    await user.selectOptions(fxSelect(), "");

    fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
      target: { value: "Café París S.A." },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].checkoutFxMode).toBeNull();
      // operationMode was absent on the GET: untouched sentinel → omit.
      expect("operationMode" in bodies[0]).toBe(false);
    });
  });

  it("keeps the POST body inside the backend whitelist (no invented numeric rate fields)", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    await user.selectOptions(operationSelect(), TenantOperationMode.FOODPARK_QSR);

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      // forbidNonWhitelisted: only the canon fields may go on the wire.
      expect("commercialRate" in bodies[0]).toBe(false);
      expect("bcnRate" in bodies[0]).toBe(false);
    });
  });

  // --- Component-level tests: manual discount caps (SOHO P3, D-A) ---
// Same snapshot contract as the mode selects: the submit decision compares
// the CURRENT input value against the value that came from the GET.
//   empty input, snapshot = number → send null (tombstone: remove the cap);
//   empty input, snapshot = null/absent → omit the key (asserts nothing);
//   a number → send it (the POS will enforce it).

describe("FiscalSetupForm — manual discount caps (SOHO P3, D-A)", () => {
  const amountInput = () =>
    screen.getByLabelText(/Descuento Máximo por Monto/i) as HTMLInputElement;
  const percentInput = () =>
    screen.getByLabelText(/Descuento Máximo por Porcentaje/i) as HTMLInputElement;

  it("renders both cap inputs empty when the GET response omits them", async () => {
    await renderLoadedForm();

    expect(amountInput().value).toBe("");
    expect(percentInput().value).toBe("");
  });

  it("prefills the caps when the GET response carries them", async () => {
    await renderLoadedForm({ maxDiscountAmount: 500, maxDiscountPercent: 15 });

    expect(amountInput().value).toBe("500");
    expect(percentInput().value).toBe("15");
  });

  it("sends the cap values when chosen", async () => {
    await renderLoadedForm();
    const user = userEvent.setup();

    fireEvent.change(amountInput(), { target: { value: "500" } });
    fireEvent.change(percentInput(), { target: { value: "15" } });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].maxDiscountAmount).toBe(500);
      expect(bodies[0].maxDiscountPercent).toBe(15);
    });
  });

  it("sends maxDiscountAmount: 0 (not omitted, not null) when 0 is typed into the amount field", async () => {
    // Regression net against falsy coercion: 0 means "forbid manual
    // discounts entirely" and must reach the wire as the number 0.
    await renderLoadedForm();
    const user = userEvent.setup();

    fireEvent.change(amountInput(), { target: { value: "0" } });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect("maxDiscountAmount" in bodies[0]).toBe(true);
      expect(bodies[0].maxDiscountAmount).toBe(0);
      expect(bodies[0].maxDiscountAmount).not.toBeNull();
    });
  });

  it("omits both cap keys when the GET carried null and the inputs stay untouched (sin configurar = sin tope)", async () => {
    await renderLoadedForm({ maxDiscountAmount: null, maxDiscountPercent: null });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
      target: { value: "Café París S.A." },
    });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect("maxDiscountAmount" in bodies[0]).toBe(false);
      expect("maxDiscountPercent" in bodies[0]).toBe(false);
    });
  });

  it("sends maxDiscountAmount: null when a stored cap is cleared from the input (tombstone)", async () => {
    await renderLoadedForm({ maxDiscountAmount: 500, maxDiscountPercent: null });
    const user = userEvent.setup();

    fireEvent.change(amountInput(), { target: { value: "" } });

    fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
    await user.click(screen.getByTestId("save-fiscal-setup-button"));

    await waitFor(() => {
      const bodies = postedFiscalBodies();
      expect(bodies).toHaveLength(1);
      expect(bodies[0].maxDiscountAmount).toBeNull();
      // maxDiscountPercent was null on the GET and untouched → omit.
      expect("maxDiscountPercent" in bodies[0]).toBe(false);
    });
  });
});

// --- BXW-007: saved-snapshot contract (per-field, independent) ---
  // The submit decision compares the CURRENT select value against the
  // value that came from the GET (the saved snapshot), never against the
  // last click and never against a constant:
  //   current = sentinel, snapshot = real value → send null (tombstone:
  //     the POS regains local control on every terminal).
  //   current = sentinel, snapshot = null/absent → omit the key (anti-
  //     downgrade guard for tenants never configured in the cloud).
  //   current = real value → send the exact literal.
  // Each field is evaluated independently: clearing one and affirming the
  // other in the same save is a supported, expected combination.
  describe("saved-snapshot contract (BXW-007 POS control recovery)", () => {
    it("clears one field and affirms the other in one save (mixed: null + literal)", async () => {
      await renderLoadedForm({
        operationMode: TenantOperationMode.RESTAURANT,
        checkoutFxMode: null,
      });
      const user = userEvent.setup();

      await user.selectOptions(operationSelect(), "");
      await user.selectOptions(fxSelect(), CheckoutFxMode.BCN_OFFICIAL);

      fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
      await user.click(screen.getByTestId("save-fiscal-setup-button"));

      await waitFor(() => {
        const bodies = postedFiscalBodies();
        expect(bodies).toHaveLength(1);
        expect(bodies[0].operationMode).toBeNull();
        expect(bodies[0].checkoutFxMode).toBe("BCN_OFFICIAL");
      });
    });

    it("affirms one field and clears the other in one save (mixed: literal + null)", async () => {
      await renderLoadedForm({
        operationMode: null,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      });
      const user = userEvent.setup();

      await user.selectOptions(operationSelect(), TenantOperationMode.HYBRID);
      await user.selectOptions(fxSelect(), "");

      fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
      await user.click(screen.getByTestId("save-fiscal-setup-button"));

      await waitFor(() => {
        const bodies = postedFiscalBodies();
        expect(bodies).toHaveLength(1);
        expect(bodies[0].operationMode).toBe("HYBRID");
        expect(bodies[0].checkoutFxMode).toBeNull();
      });
    });

    it("omits the key when a value is chosen and returned to the sentinel BEFORE saving while the snapshot was never set (snapshot governs, not the last click)", async () => {
      await renderLoadedForm({ operationMode: null, checkoutFxMode: null });
      const user = userEvent.setup();

      // Touch and revert, but the SAVED state was already "Sin definir":
      // the comparison against the snapshot yields sentinel-vs-null, so
      // the key is omitted — deterministic regardless of the clicks.
      await user.selectOptions(operationSelect(), TenantOperationMode.RESTAURANT);
      await user.selectOptions(operationSelect(), "");

      fireEvent.change(screen.getByLabelText(/Nombre Comercial/i), {
        target: { value: "Café París S.A." },
      });

      fetchSpy.mockResolvedValueOnce(fiscalPostResponse());
      await user.click(screen.getByTestId("save-fiscal-setup-button"));

      await waitFor(() => {
        const bodies = postedFiscalBodies();
        expect(bodies).toHaveLength(1);
        expect("operationMode" in bodies[0]).toBe(false);
        expect("checkoutFxMode" in bodies[0]).toBe(false);
      });
    });
  });
});
