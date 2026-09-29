/**
 * Purchase history tab — office visibility evidence (SOHO readiness).
 *
 * Purchase authoring stays on the POS; the dashboard only owes the owner a
 * faithful history read: totals, filters, empty/loading/error states and the
 * document-type distinction (purchase vs correction).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PurchasesTab } from "@/features/inventory/purchases-tab";
import { usePurchases } from "@/features/inventory/use-inventory-reports";
import type { PurchaseDocumentItem } from "@/features/inventory/types";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  usePurchases: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_DOCS: PurchaseDocumentItem[] = [
  {
    id: "doc-1",
    tenant_id: "t1",
    insumo_id: "ins-1",
    supplier_id: "sup-1",
    invoice_number: "F-001",
    document_type: "PURCHASE",
    correction_reason: null,
    correction_for_purchase_document_id: null,
    fiscal_authorization_code: null,
    invoice_date: "2026-01-05",
    entry_date: "2026-01-05",
    entry_timestamp: "2026-01-05T10:00:00.000Z",
    quantity: 5,
    unit_cost: 350,
    currency: "NIO",
    bcn_rate: 1,
    unit_cost_nio: 350,
    projected_cpp_nio: 350,
    lot_code: null,
    received_date: null,
    expiration_date: null,
    created_at: "2026-01-05T10:00:00.000Z",
    insumo: { id: "ins-1", name: "Café en Grano" },
    supplier: { id: "sup-1", name: "Café Supplier" },
  },
  {
    id: "doc-2",
    tenant_id: "t1",
    insumo_id: "ins-2",
    supplier_id: "sup-2",
    invoice_number: "F-002",
    document_type: "PURCHASE_CORRECTION",
    correction_reason: "Precio incorrecto",
    correction_for_purchase_document_id: "doc-1",
    fiscal_authorization_code: null,
    invoice_date: "2026-01-06",
    entry_date: "2026-01-06",
    entry_timestamp: "2026-01-06T10:00:00.000Z",
    quantity: -1,
    unit_cost: 350,
    currency: "NIO",
    bcn_rate: 1,
    unit_cost_nio: 350,
    projected_cpp_nio: 350,
    lot_code: null,
    received_date: null,
    expiration_date: null,
    created_at: "2026-01-06T10:00:00.000Z",
    insumo: { id: "ins-2", name: "Leche Entera" },
    supplier: { id: "sup-2", name: "Distribuidora Nica" },
  },
];

function mockQuery(
  partial: Partial<ReturnType<typeof usePurchases>>,
) {
  vi.mocked(usePurchases).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    ...partial,
  } as ReturnType<typeof usePurchases>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery({ data: MOCK_DOCS });
});

describe("PurchasesTab", () => {
  it("renders purchase rows with insumo, supplier and totals", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(screen.getByText("Café en Grano")).toBeInTheDocument();
    expect(screen.getByText("Café Supplier")).toBeInTheDocument();
    expect(screen.getByText("F-001")).toBeInTheDocument();
    // 5 × 350 = 1,750 for the first document
    expect(screen.getByText("C$1,750.00")).toBeInTheDocument();
    expect(screen.getByText("Documentos de Compra")).toBeInTheDocument();
    // Correction documents are visually distinguished.
    expect(screen.getByText("Corrección")).toBeInTheDocument();
    expect(screen.getByText("Compra")).toBeInTheDocument();
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

  it("fails visibly (not silently) when the read errors", () => {
    mockQuery({ error: new Error("network down"), data: undefined });
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/No se pudo cargar el historial de compras/i),
    ).toBeInTheDocument();
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

  it("states that authoring remains on the POS", () => {
    render(<PurchasesTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/El registro de nuevas compras se realiza desde el POS/i),
    ).toBeInTheDocument();
  });
});
