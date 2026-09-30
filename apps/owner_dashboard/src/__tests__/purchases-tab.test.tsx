/**
 * Purchase history tab — office visibility evidence (SOHO readiness).
 *
 * Purchase authoring stays on the POS; the dashboard only owes the owner a
 * faithful history read: honest totals (distinct invoices, page-scope notice),
 * filters with reset, empty/loading/error states with retry, and the
 * document-type distinction (purchase vs correction). Also hosts the
 * InventoryPage tab-bar semantics tests (AT-08) and URL context (BX-014).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchasesTab } from "@/features/inventory/purchases-tab";
import { InventoryPage } from "@/features/inventory/inventory-page";
import {
  usePurchases,
  useValuation,
  useCogs,
  useKardex,
  useAlerts,
  useSuppliers,
  useCreateSupplier,
  useCreateManualPurchase,
} from "@/features/inventory/use-inventory-reports";
import { useInsumos } from "@/features/recipes/use-recipes";
import { fetchPurchasePreview } from "@/features/inventory/inventory-api";
import { toast } from "@/hooks/use-toast";
import type { PurchaseDocumentItem } from "@/features/inventory/types";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  usePurchases: vi.fn(),
  useValuation: vi.fn(),
  useCogs: vi.fn(),
  useKardex: vi.fn(),
  useAlerts: vi.fn(),
  useSuppliers: vi.fn(),
  useCreateSupplier: vi.fn(),
  useCreateManualPurchase: vi.fn(),
}));

vi.mock("@/features/recipes/use-recipes", () => ({
  useInsumos: vi.fn(),
  // InsumosTab (rendered by InventoryPage tests) also consumes these.
  useCreateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/features/inventory/inventory-api", () => ({
  fetchPurchasePreview: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}) },
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeDoc(overrides: Partial<PurchaseDocumentItem>): PurchaseDocumentItem {
  return {
    id: "doc-x",
    tenant_id: "t1",
    insumo_id: "ins-1",
    supplier_id: "sup-1",
    invoice_number: "F-100",
    document_type: "PURCHASE",
    correction_reason: null,
    correction_for_purchase_document_id: null,
    fiscal_authorization_code: null,
    invoice_date: "2026-01-05",
    entry_date: "2026-01-05",
    entry_timestamp: "2026-01-05T10:00:00.000Z",
    quantity: 2,
    unit_cost: 100,
    currency: "NIO",
    bcn_rate: 1,
    unit_cost_nio: 100,
    projected_cpp_nio: 100,
    lot_code: null,
    received_date: null,
    expiration_date: null,
    created_at: "2026-01-05T10:00:00.000Z",
    insumo: { id: "ins-1", name: "Café en Grano" },
    supplier: { id: "sup-1", name: "Café Supplier" },
    ...overrides,
  };
}

const MOCK_DOCS: PurchaseDocumentItem[] = [
  makeDoc({ id: "doc-1", invoice_number: "F-001" }),
  makeDoc({
    id: "doc-2",
    invoice_number: "F-002",
    document_type: "PURCHASE_CORRECTION",
    correction_reason: "Precio incorrecto",
    correction_for_purchase_document_id: "doc-1",
    invoice_date: "2026-01-06",
    created_at: "2026-01-06T10:00:00.000Z",
    quantity: 3,
    insumo: { id: "ins-2", name: "Leche Entera" },
    supplier: { id: "sup-2", name: "Distribuidora Nica" },
  }),
];

const PAGE_FULL: PurchaseDocumentItem[] = Array.from({ length: 200 }, (_, i) =>
  makeDoc({ id: `doc-${i}`, invoice_number: `F-${i + 1}`, created_at: "2026-01-05T10:00:00.000Z" }),
);

const MOCK_INSUMOS = [
  { id: "ins-1", name: "Café en Grano", is_perishable: false, is_active: true },
  { id: "ins-2", name: "Leche Entera", is_perishable: true, is_active: true },
];

const PREVIEW_RESULT = {
  invoiceDate: "2026-09-30",
  currency: "NIO",
  bcnRate: 1,
  bcnRateSource: "NIO document rate",
  unitCostNio: 100,
  previousCppNio: 50,
  projectedCppNio: 83.3333,
  previousStock: 10,
  projectedStock: 12,
  requiresBatchTracking: false,
};

function mockQuery(partial: Partial<ReturnType<typeof usePurchases>>) {
  vi.mocked(usePurchases).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({}),
    ...partial,
  } as ReturnType<typeof usePurchases>);
}

function mockSuppliers(suppliers: Array<{ id: string; name: string }>) {
  vi.mocked(useSuppliers).mockReturnValue({
    data: suppliers,
    isLoading: false,
  } as ReturnType<typeof useSuppliers>);
}

function mockCreateSupplier(overrides: Partial<ReturnType<typeof useCreateSupplier>> = {}) {
  vi.mocked(useCreateSupplier).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "sup-new", name: "Nuevo Proveedor" }),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useCreateSupplier>);
}

function mockCreatePurchase(overrides: Partial<ReturnType<typeof useCreateManualPurchase>> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(useCreateManualPurchase).mockReturnValue({
    mutateAsync,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useCreateManualPurchase>);
  return mutateAsync;
}

function mockInsumos() {
  vi.mocked(useInsumos).mockReturnValue({
    data: MOCK_INSUMOS,
    isLoading: false,
  } as unknown as ReturnType<typeof useInsumos>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mockQuery({ data: MOCK_DOCS });
  mockSuppliers([{ id: "sup-1", name: "Café Supplier" }]);
  mockCreateSupplier();
  mockCreatePurchase();
  mockInsumos();
  vi.mocked(fetchPurchasePreview).mockResolvedValue(PREVIEW_RESULT);
});

describe("PurchasesTab", () => {
  it("renders purchase rows with insumo, supplier and totals", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(screen.getByText("Café en Grano")).toBeInTheDocument();
    expect(screen.getByText("Café Supplier")).toBeInTheDocument();
    expect(screen.getByText("F-001")).toBeInTheDocument();
    // 5 × 350 = 1,750 for the first document
    expect(screen.getByText("C$200.00")).toBeInTheDocument();
    expect(screen.getByText("Documentos de Compra")).toBeInTheDocument();
    // Correction documents are visually distinguished.
    expect(screen.getByText("Corrección")).toBeInTheDocument();
    expect(screen.getByText("Compra")).toBeInTheDocument();
  });

  it("counts distinct invoices, not line items (AT-07 / BX-012)", () => {
    mockQuery({
      data: [
        makeDoc({ id: "doc-a", invoice_number: "F-001" }),
        makeDoc({ id: "doc-b", invoice_number: "F-001", insumo: { id: "ins-2", name: "Leche Entera" } }),
      ],
    });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    const statCard = screen.getByText("Documentos de Compra").parentElement as HTMLElement;
    expect(within(statCard).getByText("1")).toBeInTheDocument();
  });

  it("scopes the Documentos de Compra subtitle to the active search term (R2)", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    // Without a search term the stat describes the date-range scope.
    expect(
      screen.getByText(/en el rango seleccionado/),
    ).toBeInTheDocument();

    await user.type(screen.getByTestId("purchases-search-input"), "distribuidora");

    // The count is computed over the filtered set, so the subtitle must say so.
    await waitFor(() => {
      expect(
        screen.getByText(/coinciden con tu búsqueda/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/rango seleccionado/)).not.toBeInTheDocument();
  });

  it("warns honestly when the newest-row cap is hit (AT-01 / BX-002)", () => {
    mockQuery({ data: PAGE_FULL });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    const notice = screen.getByTestId("purchases-truncation-notice");
    expect(notice).toHaveTextContent("Mostrando las 200 compras más recientes");
    expect(notice).toHaveTextContent("puede haber más en el rango");
    // §42.1/§62: an exception the owner must see wears the semantic warning
    // palette (border + tinted background), not a near-white tint.
    expect(notice).toHaveClass("border-amber-200", "bg-amber-50", "text-amber-800");
  });

  it("does not show the truncation notice when the page is not full", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(screen.queryByTestId("purchases-truncation-notice")).not.toBeInTheDocument();
  });

  it("renders the newest purchase timestamp as plain metadata, not a freshness badge (BX-016)", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    const meta = screen.getByTestId("purchases-last-created");
    expect(meta).toHaveTextContent("Última compra registrada: 05/01/2026");
  });

  it("shows the loading state", () => {
    mockQuery({ isLoading: true, data: undefined });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(screen.getByText(/Cargando historial de compras/i)).toBeInTheDocument();
  });

  it("shows the empty state with the manual-entry path when there are no documents", () => {
    mockQuery({ data: [] });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    // Web authoring exists now (SOHO purchases): the empty state offers the
    // creation path instead of sending the owner to the POS.
    expect(screen.getByTestId("purchases-register-btn")).toBeInTheDocument();
    expect(
      screen.getByText(/Sin compras registradas en este rango/i),
    ).toBeInTheDocument();
  });

  it("fails visibly and offers a working retry (AT-10 / BX-015)", async () => {
    const refetch = vi.fn().mockResolvedValue({});
    mockQuery({ error: new Error("network down"), data: undefined, refetch });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    const alert = screen.getByTestId("purchases-error-alert");
    expect(alert).toHaveTextContent(
      /No se pudo cargar el historial de compras/i,
    );
    // Destructive treatment for a failure state (§42.1), with icon + text.
    expect(alert).toHaveClass("bg-destructive/10", "text-destructive");

    const user = userEvent.setup();
    await user.click(screen.getByTestId("purchases-retry-btn"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("filters by invoice number, insumo or supplier", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.type(screen.getByTestId("purchases-search-input"), "distribuidora");

    await waitFor(() => {
      expect(screen.getByText("Distribuidora Nica")).toBeInTheDocument();
      expect(screen.queryByText("Café Supplier")).not.toBeInTheDocument();
    });
  });

  it("restores the full dataset via the search clear control (AT-09 / BX-001)", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    const input = screen.getByTestId("purchases-search-input");
    await user.type(input, "distribuidora");
    await waitFor(() => {
      expect(screen.queryByText("Café Supplier")).not.toBeInTheDocument();
    });

    const clear = screen.getByTestId("purchases-search-clear");
    expect(clear).toHaveAccessibleName("Limpiar búsqueda");
    await user.click(clear);

    await waitFor(() => {
      expect(screen.getByText("Café Supplier")).toBeInTheDocument();
      expect(screen.getByText("Distribuidora Nica")).toBeInTheDocument();
    });
    expect(input).toHaveValue("");
  });

  it("offers the manual web-entry flow while physical receiving stays on the POS", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    // Primary action visible at the top of the tab (SOHO purchases).
    expect(screen.getByTestId("purchases-register-btn")).toHaveTextContent(
      "Registrar compra",
    );
    expect(
      screen.getByText(/Puedes registrar compras aquí/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/la recepción física.*sigue gestionándose en el POS/i),
    ).toBeInTheDocument();
  });
});

/** The form dialog hosts the submit control; assert openness by its presence. */
function expectFormOpen() {
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByTestId("purchases-form-submit")).toBeInTheDocument();
  return dialog;
}

/** Picks an option from a shadcn/Radix Select by its visible label (§48). */
async function pickSelect(
  user: ReturnType<typeof userEvent.setup>,
  testId: string,
  optionName: string | RegExp,
) {
  await user.click(screen.getByTestId(testId));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

/** Opens the manual purchase form and fills every NIO required field. */
async function openAndFillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("purchases-register-btn"));
  await pickSelect(user, "purchases-form-supplier", "Café Supplier");
  await pickSelect(user, "purchases-form-insumo", "Café en Grano");
  await user.type(screen.getByTestId("purchases-form-quantity"), "2");
  await user.type(screen.getByTestId("purchases-form-unit-cost"), "100");
  await user.type(screen.getByTestId("purchases-form-invoice-number"), "F-500");
}

describe("PurchasesTab — manual purchase form (SOHO purchases)", () => {
  it("opens the form with supplier, insumo and currency selects", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));

    const dialog = expectFormOpen();
    expect(
      within(dialog).getByRole("heading", { name: "Registrar compra" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("purchases-form-supplier")).toBeInTheDocument();
    expect(screen.getByTestId("purchases-form-insumo")).toBeInTheDocument();
    expect(screen.getByTestId("purchases-form-currency")).toHaveTextContent(
      "NIO (Córdobas)",
    );
    // Visible labels with required marks, no placeholder-as-label (§17.2/§17.3).
    expect(screen.getByText("Proveedor *")).toBeInTheDocument();
    expect(screen.getByText("Insumo *")).toBeInTheDocument();
    expect(screen.getByText("Número de factura *")).toBeInTheDocument();
  });

  it("blocks submit while required fields are missing, with actionable copy", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));
    // Nothing filled yet: no preview payload, submit stays disabled and the
    // preview panel tells the owner exactly what is missing (§18).
    const submit = screen.getByTestId("purchases-form-submit");
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("purchases-form-preview")).toHaveTextContent(
      /Completa proveedor, insumo, cantidad, costo y factura/i,
    );

    // Partial fill is still not submittable.
    await pickSelect(user, "purchases-form-supplier", "Café Supplier");
    await user.type(screen.getByTestId("purchases-form-quantity"), "2");
    expect(submit).toBeDisabled();
  });

  it("shows the CPP preview before submit and keeps submit disabled until it resolves", async () => {
    let resolvePreview: (value: typeof PREVIEW_RESULT) => void = () => {};
    vi.mocked(fetchPurchasePreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await openAndFillForm(user);

    // Preview in flight: no blind submit (§49 +1.7).
    expect(screen.getByTestId("purchases-form-submit")).toBeDisabled();
    expect(screen.getByTestId("purchases-form-preview")).toHaveTextContent(
      /Calculando el costo proyectado/i,
    );

    resolvePreview(PREVIEW_RESULT);
    await waitFor(() => {
      expect(screen.getByTestId("purchases-preview-cpp")).toHaveTextContent(
        /C\$50.00/i,
      );
    });
    expect(screen.getByTestId("purchases-preview-projected")).toHaveTextContent(
      "C$83.33",
    );
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
    });
    expect(fetchPurchasePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: "sup-1",
        insumoId: "ins-1",
        quantity: 2,
        unitCost: 100,
        currency: "NIO",
        invoiceNumber: "F-500",
      }),
    );
  });

  // Bug fix (founder real-device test, 2026-09-30): typing the invoice number
  // completes the preview payload. The preview route — which never commits a
  // document and never carries the server-generated purchase id — now
  // validates with a preview-specific DTO, so a settled payload RESOLVES the
  // projection. Regression guards: (1) the preview payload never carries an
  // `id`, (2) when a preview fails the CPP card renders the mapped error path
  // (getApiErrorMessage in purchases-form.tsx — never a raw err.message or
  // [object Object], §18.2/AP-10) and keeps the submit gate closed, and (3)
  // the card recovers and renders the projected cost once a preview succeeds
  // for the current inputs.
  it("fires the preview without an id, gates submit on preview errors and recovers", async () => {
    // The form fires a preview on every settled payload (each invoice-number
    // keystroke settles one) and drops stale in-flight responses via its seq
    // guard, so only the LATEST deferred matters: rejectCurrent fails the
    // active attempt; resolveCurrent recovers the active attempt.
    const pending: Array<{
      resolve: (value: typeof PREVIEW_RESULT) => void;
      reject: (err: unknown) => void;
    }> = [];
    vi.mocked(fetchPurchasePreview).mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    const rejectCurrent = (err: unknown) => {
      pending.pop()?.reject(err);
    };
    const resolveCurrent = (value: typeof PREVIEW_RESULT) => {
      pending.pop()?.resolve(value);
    };
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await openAndFillForm(user);

    // The settled payload fires the preview with exactly the
    // ManualPurchaseInput contract: no document id (the manual route
    // generates it server-side).
    await waitFor(() => {
      expect(fetchPurchasePreview).toHaveBeenCalled();
    });
    for (const call of vi.mocked(fetchPurchasePreview).mock.calls) {
      expect(call[0]).not.toHaveProperty("id");
    }

    // The active (latest) attempt fails: the mapped error path renders (never
    // a raw [object Object]) and the submit gate stays closed.
    rejectCurrent({
      status: 400,
      responseBody: {
        message: ["id should not be empty", "id must be a string"],
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-preview")).toHaveTextContent(
        /No se pudo calcular|id should not be empty/i,
      );
    });
    expect(screen.getByTestId("purchases-form-preview")).not.toHaveTextContent(
      "[object Object]",
    );
    expect(screen.getByTestId("purchases-form-submit")).toBeDisabled();

    // The owner edits an input (quantity 2 → 3): a new preview fires for the
    // changed payload and the projected cost renders when it resolves — the
    // card recovers without closing the form.
    await user.type(screen.getByTestId("purchases-form-quantity"), "3");
    await waitFor(() => {
      expect(vi.mocked(fetchPurchasePreview).mock.calls.length).toBeGreaterThan(
        1,
      );
    });
    resolveCurrent(PREVIEW_RESULT);
    await waitFor(() => {
      expect(
        screen.getByTestId("purchases-preview-projected"),
      ).toHaveTextContent("C$83.33");
    });
    expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
  });

  it("submits through the manual route, toasts, resets and keeps the panel open (§19.3)", async () => {
    const mutateAsync = mockCreatePurchase();
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await openAndFillForm(user);
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
    });

    await user.click(screen.getByTestId("purchases-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "sup-1",
          insumoId: "ins-1",
          quantity: 2,
          unitCost: 100,
          currency: "NIO",
          invoiceNumber: "F-500",
        }),
      );
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Compra registrada" }),
    );
    // Multiple purchases are common: form resets for the next entry but the
    // dialog stays open.
    expect(screen.getByTestId("purchases-form-quantity")).toHaveValue(null);
    expect(screen.getByTestId("purchases-form-supplier")).toHaveTextContent(
      "Seleccione proveedor",
    );
    expectFormOpen();
  });

  it("surfaces server errors via getApiErrorMessage and preserves the form", async () => {
    mockCreatePurchase({
      mutateAsync: vi.fn().mockRejectedValue({
        status: 409,
        // The human manual route answers in business Spanish and never with a
        // raw supplier UUID (standard §22/§39.1) — backend contract copy.
        responseBody: {
          message:
            "Ya existe una compra registrada con la factura 'F-500' para el proveedor 'Café Supplier'.",
        },
      }),
    });
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await openAndFillForm(user);
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
    });
    await user.click(screen.getByTestId("purchases-form-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /Ya existe una compra registrada con la factura 'F-500'/i,
    );
    // Dialog/panel preserved — no silent close over a failure.
    expectFormOpen();
  });

  it("creates a supplier inline when the catalog is empty, then selects it", async () => {
    mockSuppliers([]);
    const createSupplierMutate = vi
      .fn()
      .mockResolvedValue({ id: "sup-new", name: "Nuevo Proveedor" });
    mockCreateSupplier({ mutateAsync: createSupplierMutate });
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));

    // Empty catalog: the quick-create path is offered without hiding the select.
    expect(screen.getByTestId("purchases-supplier-create-name")).toBeInTheDocument();
    expect(screen.getByText(/solo el nombre es obligatorio/i)).toBeInTheDocument();

    await user.type(
      screen.getByTestId("purchases-supplier-create-name"),
      "Nuevo Proveedor",
    );
    // The catalog refreshes after creation; the form then auto-selects the
    // new supplier for the purchase.
    mockSuppliers([{ id: "sup-new", name: "Nuevo Proveedor" }]);
    await user.click(screen.getByTestId("purchases-supplier-create-btn"));

    await waitFor(() => {
      expect(createSupplierMutate).toHaveBeenCalledWith({ name: "Nuevo Proveedor" });
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Proveedor creado" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-supplier")).toHaveTextContent(
        "Nuevo Proveedor",
      );
    });
  });

  it("reveals the BCN rate input only for USD purchases and validates it", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));

    expect(
      screen.queryByTestId("purchases-form-bcn-rate"),
    ).not.toBeInTheDocument();

    await pickSelect(user, "purchases-form-currency", "USD (Dólares)");
    expect(screen.getByTestId("purchases-form-bcn-rate")).toBeInTheDocument();
    expect(screen.getByText(/Tasa BCN \(C\$ por US\$\) \*/)).toBeInTheDocument();

    // USD without a rate: preview never resolves, submit stays blocked.
    await pickSelect(user, "purchases-form-supplier", "Café Supplier");
    await pickSelect(user, "purchases-form-insumo", "Café en Grano");
    await user.type(screen.getByTestId("purchases-form-quantity"), "2");
    await user.type(screen.getByTestId("purchases-form-unit-cost"), "10");
    await user.type(screen.getByTestId("purchases-form-invoice-number"), "F-USD");
    expect(screen.getByTestId("purchases-form-submit")).toBeDisabled();

    await user.type(screen.getByTestId("purchases-form-bcn-rate"), "36.8");
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
    });
    expect(fetchPurchasePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: "USD", bcnRate: 36.8, fxRateMode: "explicit" }),
    );
  });

  it("requires batch metadata for perishable insumos (backend FIFO rule)", async () => {
    const mutateAsync = mockCreatePurchase();
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));
    await pickSelect(user, "purchases-form-insumo", "Leche Entera (perecedero)");

    expect(screen.getByText("Lote *")).toBeInTheDocument();
    expect(screen.getByText("Fecha de recepción *")).toBeInTheDocument();
    expect(screen.getByText("Fecha de vencimiento *")).toBeInTheDocument();

    // Full valid non-batch data cannot submit while the batch fields are
    // missing — the form gates before the backend's batch assertion.
    await pickSelect(user, "purchases-form-supplier", "Café Supplier");
    await user.type(screen.getByTestId("purchases-form-quantity"), "2");
    await user.type(screen.getByTestId("purchases-form-unit-cost"), "100");
    await user.type(screen.getByTestId("purchases-form-invoice-number"), "F-PER");
    await waitFor(() => {
      expect(fetchPurchasePreview).toHaveBeenCalled();
    });
    // Preview resolved, but the perishable batch fields are still required:
    // the submit stays gated (client mirror of the backend batch assertion).
    expect(screen.getByTestId("purchases-form-submit")).toBeDisabled();

    await user.type(screen.getByTestId("purchases-form-lot"), "L-2026-01");
    await user.type(screen.getByTestId("purchases-form-received"), "2026-09-30");
    await user.type(screen.getByTestId("purchases-form-expiration"), "2026-10-30");
    await waitFor(() => {
      expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
    });
    await user.click(screen.getByTestId("purchases-form-submit"));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          lotCode: "L-2026-01",
          receivedDate: "2026-09-30",
          expirationDate: "2026-10-30",
        }),
      );
    });
  });

  it("allows explicit acknowledgement when the preview fails, instead of submitting blind (§49)", async () => {
    vi.mocked(fetchPurchasePreview).mockRejectedValue({
      status: 500,
      responseBody: { message: "Tasa oficial no disponible para la fecha" },
    });
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await openAndFillForm(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Tasa oficial no disponible/i);
    expect(screen.getByTestId("purchases-form-submit")).toBeDisabled();

    await user.click(screen.getByTestId("purchases-form-ack"));
    expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
  });

  it("keeps a resolved preview when batch fields change — they are not preview inputs (§49 +1.7)", async () => {
    const user = userEvent.setup();
    render(<PurchasesTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("purchases-register-btn"));
    await pickSelect(user, "purchases-form-insumo", "Leche Entera (perecedero)");
    await pickSelect(user, "purchases-form-supplier", "Café Supplier");
    await user.type(screen.getByTestId("purchases-form-quantity"), "2");
    await user.type(screen.getByTestId("purchases-form-unit-cost"), "100");
    await user.type(screen.getByTestId("purchases-form-invoice-number"), "F-PER");

    await waitFor(() => {
      expect(screen.getByTestId("purchases-preview-projected")).toHaveTextContent(
        "C$83.33",
      );
    });
    // The preview refetches per preview-relevant keystroke; freeze the count
    // once the projection resolved.
    const callsAfterPreview = vi.mocked(fetchPurchasePreview).mock.calls.length;
    expect(callsAfterPreview).toBeGreaterThan(0);

    // Contract pin: the backend preview (`POST /inventory/purchase`) never
    // reads lotCode/receivedDate/expirationDate, so toggling them must NOT
    // refetch, invalidate the resolved preview, or clear the acknowledgement.
    await user.type(screen.getByTestId("purchases-form-lot"), "L-2026-01");
    await user.type(screen.getByTestId("purchases-form-received"), "2026-09-30");
    await user.type(screen.getByTestId("purchases-form-expiration"), "2026-10-30");

    expect(vi.mocked(fetchPurchasePreview).mock.calls.length).toBe(
      callsAfterPreview,
    );
    expect(screen.getByTestId("purchases-preview-projected")).toHaveTextContent(
      "C$83.33",
    );
    expect(screen.getByTestId("purchases-form-submit")).toBeEnabled();
  });
});

describe("InventoryPage tab bar (AT-08 / BX-013)", () => {
  beforeEach(() => {
    vi.mocked(useValuation).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useValuation>);
    vi.mocked(useCogs).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useCogs>);
    vi.mocked(useKardex).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useKardex>);
    vi.mocked(useAlerts).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useAlerts>);
  });

  it("exposes semantic tabs with aria-selected state", () => {
    render(<InventoryPage />, { wrapper: TestWrapper });

    const tablist = screen.getByRole("tablist", { name: "Secciones de inventario" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("moves selection with arrow keys (selection follows focus)", async () => {
    const user = userEvent.setup();
    render(<InventoryPage />, { wrapper: TestWrapper });

    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    await user.click(tabs[0]!);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{End}");
    await waitFor(() => {
      expect(tabs[6]).toHaveAttribute("aria-selected", "true");
    });

    await user.keyboard("{Home}");
    await waitFor(() => {
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    });
  });

  it("restores the purchases tab from the ?tab= deep link", () => {
    window.history.replaceState(null, "", "/inventory?tab=purchases");
    render(<InventoryPage />, { wrapper: TestWrapper });

    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });
});

describe("InventoryPage URL context (BX-014)", () => {
  it("persists the insumos search term into the URL as it is typed", async () => {
    const user = userEvent.setup();

    function LocationProbe() {
      const location = useLocation();
      return <span data-testid="location-probe">{location.search}</span>;
    }

    render(
      <MemoryRouter initialEntries={["/inventory?tab=insumos"]}>
        <TestWrapper>
          <Routes>
            <Route
              path="/inventory"
              element={
                <>
                  <InventoryPage />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </TestWrapper>
      </MemoryRouter>,
    );

    await user.type(await screen.findByTestId("insumos-search-input"), "leche");

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("q_insumos=leche");
    });

    // Clearing removes the param again.
    await user.click(screen.getByTestId("insumos-search-clear"));
    await waitFor(() => {
      expect(screen.getByTestId("location-probe").textContent).not.toContain("q_insumos");
    });
  });
});
