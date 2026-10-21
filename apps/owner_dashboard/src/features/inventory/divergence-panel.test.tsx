import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { InventoryDivergencePanel } from "./divergence-panel";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

/**
 * FD-01: the owner's work list.
 *
 * The difference between what a sale consumed and what the inventory backed
 * used to be a rejection in the cloud, and that rejection froze the
 * terminal's fiscal sequence. Now it is DECLARED — and this screen is where
 * the owner picks it up: the sale, the units, the money, and the insumo whose
 * stock does not add up to its lots (the origin of the difference).
 */
describe("InventoryDivergencePanel", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
  });

  const mockQueries = (
    divergences: unknown,
    parity: unknown,
    options: { divergencesError?: boolean } = {},
  ) => {
    vi.mocked(useQuery)
      .mockReturnValueOnce({
        data: divergences,
        isLoading: false,
        isError: options.divergencesError ?? false,
      } as never)
      .mockReturnValueOnce({
        data: parity,
        isLoading: false,
        isError: false,
      } as never);
  };

  it("says nothing when there is nothing pending", () => {
    mockQueries({ total: 0, items: [] }, { total: 0, items: [] });

    render(<InventoryDivergencePanel />);

    expect(
      screen.getByText(/No hay diferencias de inventario pendientes/i),
    ).toBeTruthy();
    expect(screen.queryByText(/sin respaldo/i)).toBeNull();
  });

  it("names the sale, the units without backing and the money", () => {
    mockQueries(
      {
        total: 1,
        items: [
          {
            id: "div-1",
            invoiceId: "inv-1",
            invoiceNumber: "001-001-01-00000014",
            insumoId: "ins-1",
            quantity: 100,
            unitCostNio: 12.5,
            amountNio: 1250,
            cause: "LOT_COVERAGE_INSUFFICIENT",
            status: "OPEN",
            sourceDeviceId: "S23",
            sourceSequence: "9",
            createdAt: "2026-10-21T00:00:00.000Z",
            reconciledAt: null,
            reconciliationRef: null,
            resolutionNote: null,
          },
        ],
      },
      { total: 0, items: [] },
    );

    render(<InventoryDivergencePanel />);

    expect(screen.getByText("001-001-01-00000014")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText(/C\$?\s?1,250/)).toBeTruthy();
    expect(
      screen.getByText(/no estaban en ningún lote/i),
    ).toBeTruthy();
  });

  it("names the insumo whose stock does not add up to its lots", () => {
    mockQueries(
      { total: 0, items: [] },
      {
        total: 1,
        items: [
          {
            insumoId: "ins-2",
            insumoName: "Leche",
            declaredStock: 150,
            lotStock: 50,
            gap: 100,
          },
        ],
      },
    );

    render(<InventoryDivergencePanel />);

    expect(screen.getByText("Leche")).toBeTruthy();
    expect(
      screen.getByText(/Insumos cuyo stock no cuadra con sus lotes/i),
    ).toBeTruthy();
  });

  it("fails visibly, never silently, when the read fails", () => {
    mockQueries(undefined, { total: 0, items: [] }, { divergencesError: true });

    render(<InventoryDivergencePanel />);

    expect(
      screen.getByText(/No se pudieron leer las diferencias/i),
    ).toBeTruthy();
  });
});
