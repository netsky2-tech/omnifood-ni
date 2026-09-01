import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FiscalPage } from "@/features/fiscal/fiscal-page";
import {
  useMonthlyFiscalSummary,
  useVoidedInvoices,
  useSequenceAudit,
  useSalesBookExport,
  useZReportsExport,
} from "@/features/fiscal/use-fiscal-reports";

vi.mock("@/features/fiscal/use-fiscal-reports", () => ({
  useMonthlyFiscalSummary: vi.fn(() => ({
    data: {
      year: 2026,
      month: 8,
      totalGrossSales: 485000.75,
      totalTaxableSales: 421739.78,
      totalExemptSales: 0,
      totalTaxCollected: 63260.97,
      totalCreditNotes: 2,
      totalCreditNotesTax: 150.0,
      netTaxableSales: 421589.78,
      netTaxPayable: 63110.97,
      invoiceCount: 312,
      creditNoteCount: 2,
      generatedAt: "2026-08-31T15:30:00Z",
    },
    isLoading: false,
    error: null,
  })),
  useVoidedInvoices: vi.fn(() => ({
    data: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      totalVoidedCount: 3,
      totalVoidedAmount: 1250.0,
      generatedAt: "2026-08-31T15:30:00Z",
      invoices: [
        {
          id: "v1",
          number: "001-001-01-00000045",
          total: 500.0,
          subtotal: 434.78,
          totalTax: 65.22,
          voidReason: "Cliente canceló pedido",
          canceledAt: "2026-08-15T10:30:00Z",
          userId: "u1",
          cashierName: "María López",
        },
        {
          id: "v2",
          number: "001-001-01-00000078",
          total: 350.0,
          subtotal: 304.35,
          totalTax: 45.65,
          voidReason: "Error en cantidades",
          canceledAt: "2026-08-20T14:15:00Z",
          userId: "u2",
          cashierName: "Carlos Ruiz",
        },
        {
          id: "v3",
          number: "001-001-01-00000102",
          total: 400.0,
          subtotal: 347.83,
          totalTax: 52.17,
          voidReason: "Doble cobro",
          canceledAt: "2026-08-25T09:45:00Z",
          userId: "u1",
          cashierName: "María López",
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useSequenceAudit: vi.fn(() => ({
    data: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      startSequence: 1,
      endSequence: 312,
      expectedCount: 312,
      actualCount: 310,
      missingSequences: [156, 203],
      duplicateSequences: [],
      hasGaps: true,
      series: [
        {
          seriesPrefix: "001-001-01",
          startSequence: 1,
          endSequence: 312,
          expectedCount: 312,
          actualCount: 310,
          missingSequences: [156, 203],
          duplicateSequences: [],
          hasGaps: true,
        },
      ],
      generatedAt: "2026-08-31T15:30:00Z",
    },
    isLoading: false,
    error: null,
  })),
  useSalesBookExport: vi.fn(() => ({
    data: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      generatedAt: "2026-08-31T15:30:00Z",
      totalRecords: 312,
      totalGrossNio: 485000.75,
      totalTaxNio: 63260.97,
      totalExemptNio: 0,
      records: [],
    },
    isLoading: false,
    error: null,
  })),
  useZReportsExport: vi.fn(() => ({
    data: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      generatedAt: "2026-08-31T15:30:00Z",
      totalRecords: 28,
      records: [],
    },
    isLoading: false,
    error: null,
  })),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("W4 — FiscalPage", () => {
  it("renders heading and all tabs", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Fiscal")).toBeInTheDocument();
    expect(screen.getByText("Resumen Mensual")).toBeInTheDocument();
    expect(screen.getByText("Anulaciones")).toBeInTheDocument();
    expect(screen.getByText("Auditoría Secuencia")).toBeInTheDocument();
    expect(screen.getByText("Exportaciones")).toBeInTheDocument();
  });

  it("defaults to monthly summary tab", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Ventas Brutas")).toBeInTheDocument();
    expect(screen.getByText("Ventas Gravables")).toBeInTheDocument();
    expect(screen.getByText("IVA Recaudado")).toBeInTheDocument();
  });

  it("renders monthly summary stats", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Facturas")).toBeInTheDocument();
    expect(screen.getByText("Notas de Crédito")).toBeInTheDocument();
    expect(screen.getByText("Neto Gravable")).toBeInTheDocument();
    expect(screen.getByText("IVA Neto a Pagar")).toBeInTheDocument();
  });

  it("switches to voided invoices tab", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Anulaciones").click();
    await waitFor(() => {
      expect(screen.getByText("Total Anuladas")).toBeInTheDocument();
      expect(screen.getByText("Monto Total Anulado")).toBeInTheDocument();
    });
  });

  it("renders voided invoices table", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Anulaciones").click();
    await waitFor(() => {
      expect(screen.getByText("001-001-01-00000045")).toBeInTheDocument();
      expect(screen.getAllByText("María López").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Carlos Ruiz")).toBeInTheDocument();
      expect(screen.getByText("Cliente canceló pedido")).toBeInTheDocument();
    });
  });

  it("switches to sequence audit tab", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText("Secuencia Esperada")).toBeInTheDocument();
      expect(screen.getByText("Secuencia Real")).toBeInTheDocument();
      expect(screen.getByText("Secuencias Faltantes")).toBeInTheDocument();
    });
  });

  it("shows gap warning when sequence has gaps", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText(/2 secuencia\(s\) faltante\(s\)/)).toBeInTheDocument();
      expect(screen.getByText("156, 203")).toBeInTheDocument();
    });
  });

  it("renders series details in sequence audit", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText("001-001-01")).toBeInTheDocument();
      expect(screen.getByText("310 / 312")).toBeInTheDocument();
    });
  });

  it("switches to exports tab", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Exportaciones").click();
    await waitFor(() => {
      expect(screen.getByText("Libro de Ventas")).toBeInTheDocument();
      expect(screen.getByText("Reportes Z")).toBeInTheDocument();
    });
  });

  it("renders export summary stats", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Exportaciones").click();
    await waitFor(() => {
      expect(screen.getByText("312 registros")).toBeInTheDocument();
      expect(screen.getByText("28 registros")).toBeInTheDocument();
    });
  });

  it("shows export buttons", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Exportaciones").click();
    await waitFor(() => {
      const csvButtons = screen.getAllByText("CSV");
      expect(csvButtons.length).toBeGreaterThanOrEqual(2);
      const jsonButtons = screen.getAllByText("JSON");
      expect(jsonButtons.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("W4 — FiscalPage loading states", () => {
  beforeEach(() => {
    vi.mocked(useMonthlyFiscalSummary).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useMonthlyFiscalSummary>);
    vi.mocked(useVoidedInvoices).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useVoidedInvoices>);
    vi.mocked(useSequenceAudit).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useSequenceAudit>);
    vi.mocked(useSalesBookExport).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useSalesBookExport>);
    vi.mocked(useZReportsExport).mockReturnValue({
      data: undefined, isLoading: true, error: null,
    } as ReturnType<typeof useZReportsExport>);
  });

  it("shows spinner on monthly summary tab while loading", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows spinner on voided tab while loading", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Anulaciones").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on sequence tab while loading", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  it("shows spinner on exports tab while loading", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Exportaciones").click();
    await waitFor(() => {
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });
});

describe("W4 — FiscalPage error states", () => {
  beforeEach(() => {
    vi.mocked(useMonthlyFiscalSummary).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DGI offline"),
    } as ReturnType<typeof useMonthlyFiscalSummary>);
    vi.mocked(useVoidedInvoices).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DGI offline"),
    } as ReturnType<typeof useVoidedInvoices>);
    vi.mocked(useSequenceAudit).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DGI offline"),
    } as ReturnType<typeof useSequenceAudit>);
    vi.mocked(useSalesBookExport).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DGI offline"),
    } as ReturnType<typeof useSalesBookExport>);
    vi.mocked(useZReportsExport).mockReturnValue({
      data: undefined, isLoading: false, error: new Error("DGI offline"),
    } as ReturnType<typeof useZReportsExport>);
  });

  it("renders empty state on monthly summary tab when error", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Sin datos de resumen fiscal")).toBeInTheDocument();
  });

  it("renders empty state on voided tab when error", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Anulaciones").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de anulaciones")).toBeInTheDocument();
    });
  });

  it("renders empty state on sequence tab when error", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText("Sin datos de auditoría de secuencia")).toBeInTheDocument();
    });
  });

  it("does not crash and still renders page heading", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Fiscal")).toBeInTheDocument();
  });

  it("does not render data tables on error", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("001-001-01-00000045")).not.toBeInTheDocument();
    expect(screen.queryByText("María López")).not.toBeInTheDocument();
  });
});

describe("W4 — FiscalPage empty data edge cases", () => {
  beforeEach(() => {
    vi.mocked(useMonthlyFiscalSummary).mockReturnValue({
      data: {
        year: 2026, month: 9,
        totalGrossSales: 0, totalTaxableSales: 0, totalExemptSales: 0,
        totalTaxCollected: 0, totalCreditNotes: 0, totalCreditNotesTax: 0,
        netTaxableSales: 0, netTaxPayable: 0,
        invoiceCount: 0, creditNoteCount: 0,
        generatedAt: "2026-09-01T00:00:00Z",
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useMonthlyFiscalSummary>);
    vi.mocked(useVoidedInvoices).mockReturnValue({
      data: {
        totalVoidedCount: 0, totalVoidedAmount: 0,
        generatedAt: "2026-09-01T00:00:00Z",
        invoices: [],
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useVoidedInvoices>);
    vi.mocked(useSequenceAudit).mockReturnValue({
      data: {
        startSequence: 1, endSequence: 5, expectedCount: 5, actualCount: 5,
        missingSequences: [], duplicateSequences: [], hasGaps: false,
        series: [
          {
            seriesPrefix: "001-001-01", startSequence: 1, endSequence: 5,
            expectedCount: 5, actualCount: 5,
            missingSequences: [], duplicateSequences: [], hasGaps: false,
          },
        ],
        generatedAt: "2026-09-01T00:00:00Z",
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useSequenceAudit>);
    vi.mocked(useSalesBookExport).mockReturnValue({
      data: {
        generatedAt: "2026-09-01T00:00:00Z",
        totalRecords: 0, totalGrossNio: 0, totalTaxNio: 0, totalExemptNio: 0,
        records: [],
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useSalesBookExport>);
    vi.mocked(useZReportsExport).mockReturnValue({
      data: {
        generatedAt: "2026-09-01T00:00:00Z", totalRecords: 0, records: [],
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useZReportsExport>);
  });

  it("renders zero values in summary stats", () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    expect(screen.getAllByText("C$0.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty voided invoices table", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Anulaciones").click();
    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("C$0.00")).toBeInTheDocument();
    });
  });

  it("shows no gap warning when hasGaps is false", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.queryByText(/faltante/)).not.toBeInTheDocument();
    });
  });

  it("shows OK badge for series without gaps", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText("OK")).toBeInTheDocument();
      expect(screen.queryByText("CON FALTAS")).not.toBeInTheDocument();
    });
  });

  it("renders 0 missing sequences stat", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText("Secuencias Faltantes")).toBeInTheDocument();
    });
  });
});

describe("W4 — FiscalPage duplicate sequences", () => {
  beforeEach(() => {
    vi.mocked(useMonthlyFiscalSummary).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as ReturnType<typeof useMonthlyFiscalSummary>);
    vi.mocked(useVoidedInvoices).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as ReturnType<typeof useVoidedInvoices>);
    vi.mocked(useSequenceAudit).mockReturnValue({
      data: {
        startSequence: 1, endSequence: 10, expectedCount: 10, actualCount: 12,
        missingSequences: [], duplicateSequences: [5, 10], hasGaps: false,
        series: [
          {
            seriesPrefix: "001-001-01", startSequence: 1, endSequence: 10,
            expectedCount: 10, actualCount: 12,
            missingSequences: [], duplicateSequences: [5, 10], hasGaps: false,
          },
        ],
        generatedAt: "2026-09-01T00:00:00Z",
      },
      isLoading: false, error: null,
    } as ReturnType<typeof useSequenceAudit>);
    vi.mocked(useSalesBookExport).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as ReturnType<typeof useSalesBookExport>);
    vi.mocked(useZReportsExport).mockReturnValue({
      data: undefined, isLoading: false, error: null,
    } as ReturnType<typeof useZReportsExport>);
  });

  it("shows duplicate sequences warning", async () => {
    render(<FiscalPage />, { wrapper: TestWrapper });
    screen.getByText("Auditoría Secuencia").click();
    await waitFor(() => {
      expect(screen.getByText(/2 secuencia\(s\) duplicada\(s\)/)).toBeInTheDocument();
      expect(screen.getByText("5, 10")).toBeInTheDocument();
    });
  });
});
