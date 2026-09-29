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
} from "@/features/inventory/use-inventory-reports";
import type { PurchaseDocumentItem } from "@/features/inventory/types";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  usePurchases: vi.fn(),
  useValuation: vi.fn(),
  useCogs: vi.fn(),
  useKardex: vi.fn(),
  useAlerts: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
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

function mockQuery(partial: Partial<ReturnType<typeof usePurchases>>) {
  vi.mocked(usePurchases).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({}),
    ...partial,
  } as ReturnType<typeof usePurchases>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mockQuery({ data: MOCK_DOCS });
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

  it("shows the POS-authoring empty state when there are no documents", () => {
    mockQuery({ data: [] });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/se registran desde el POS/i),
    ).toBeInTheDocument();
  });

  it("fails visibly and offers a working retry (AT-10 / BX-015)", async () => {
    const refetch = vi.fn().mockResolvedValue({});
    mockQuery({ error: new Error("network down"), data: undefined, refetch });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/No se pudo cargar el historial de compras/i),
    ).toBeInTheDocument();

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

  it("states that authoring remains on the POS", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/El registro de nuevas compras se realiza desde el POS/i),
    ).toBeInTheDocument();
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
    expect(tabs).toHaveLength(6);
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
      expect(tabs[5]).toHaveAttribute("aria-selected", "true");
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
