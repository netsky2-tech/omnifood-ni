/**
 * Insumos management tab — Dashboard CRUD evidence (SOHO go-live readiness).
 *
 * The owner must be able to create and maintain materia prima (insumos) from
 * the web dashboard, not only from the POS: search, stats, empty state and
 * the create/edit dialog follow the NHILOS backoffice experience standard.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsumosTab } from "@/features/inventory/insumos-tab";
import {
  useInsumos,
  useCreateInsumo,
  useUpdateInsumo,
} from "@/features/recipes/use-recipes";
import type { Insumo } from "@/features/recipes/types";

vi.mock("@/features/recipes/use-recipes", () => ({
  useInsumos: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_INSUMOS: Insumo[] = [
  {
    id: "ins-1",
    tenant_id: "t1",
    name: "Café en Grano",
    purchaseUom: "LB",
    consumptionUom: "G",
    conversionFactor: 454,
    stock: 4540,
    averageCost: 350,
    parLevel: 2000,
    minStock: 500,
    is_perishable: false,
    negativeStockPolicy: "RESTRICT",
    is_active: true,
  },
  {
    id: "ins-2",
    tenant_id: "t1",
    name: "Leche Entera",
    purchaseUom: "L",
    consumptionUom: "ML",
    conversionFactor: 1000,
    stock: 4000,
    averageCost: 55,
    parLevel: 10000,
    minStock: 2000,
    is_perishable: true,
    negativeStockPolicy: "RESTRICT",
    is_active: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useInsumos).mockReturnValue({
    data: MOCK_INSUMOS,
    isLoading: false,
  } as ReturnType<typeof useInsumos>);
  vi.mocked(useCreateInsumo).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateInsumo>);
  vi.mocked(useUpdateInsumo).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInsumo>);
});

describe("InsumosTab", () => {
  it("renders the insumos list with conversion and FIFO properties", () => {
    render(<InsumosTab />, { wrapper: TestWrapper });

    expect(screen.getByText("Café en Grano")).toBeInTheDocument();
    expect(screen.getByText("Leche Entera")).toBeInTheDocument();
    // Conversion badge pair: purchase → consumption unit.
    expect(screen.getByText("LB")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
    // Perishable property badge (FIFO control).
    expect(screen.getByText("Perecedero")).toBeInTheDocument();
    // Stats reflect the loaded rows.
    expect(screen.getByText("Total Insumos")).toBeInTheDocument();
  });

  it("shows an empty state with guidance when no insumos exist", () => {
    vi.mocked(useInsumos).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useInsumos>);

    render(<InsumosTab />, { wrapper: TestWrapper });

    expect(
      screen.getByText(/Comience agregando materia prima/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("add-insumo-btn")).not.toBeDisabled();
  });

  it("filters rows by search term", async () => {
    const user = userEvent.setup();
    render(<InsumosTab />, { wrapper: TestWrapper });

    await user.type(screen.getByTestId("insumos-search-input"), "leche");

    await waitFor(() => {
      expect(screen.getByText("Leche Entera")).toBeInTheDocument();
      expect(screen.queryByText("Café en Grano")).not.toBeInTheDocument();
    });
  });

  it("creates an insumo through the dialog with the required fields", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    render(<InsumosTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Azúcar Blanca");
    await user.clear(screen.getByTestId("insumo-form-purchase-uom"));
    await user.type(screen.getByTestId("insumo-form-purchase-uom"), "lb");
    await user.clear(screen.getByTestId("insumo-form-consumption-uom"));
    await user.type(screen.getByTestId("insumo-form-consumption-uom"), "g");
    await user.clear(screen.getByTestId("insumo-form-conversion-factor"));
    await user.click(screen.getByTestId("insumo-form-conversion-factor"));
    await user.keyboard("{Control>}a{/Control}454");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Azúcar Blanca",
          purchaseUom: "LB",
          consumptionUom: "G",
          conversionFactor: 454,
        }),
      );
    });
  });

  it("blocks submission when the name is blank", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    render(<InsumosTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(/El nombre del insumo es obligatorio/i),
      ).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("edits an existing insumo through the dialog", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    render(<InsumosTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("edit-insumo-ins-1"));
    await waitFor(() => {
      expect(
        screen.getByText(/Editar Insumo/i),
      ).toBeInTheDocument();
    });

    await user.clear(screen.getByTestId("insumo-form-par-level"));
    await user.type(screen.getByTestId("insumo-form-par-level"), "3000");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "ins-1",
        input: expect.objectContaining({
          name: "Café en Grano",
          parLevel: 3000,
        }),
      });
    });
  });

  it("surfaces backend errors in the dialog instead of closing it", async () => {
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockRejectedValue(
          new Error("Ya existe un insumo con el nombre 'Azúcar Blanca'"),
        ),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    render(<InsumosTab />, { wrapper: TestWrapper });

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Azúcar Blanca");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(/Ya existe un insumo con el nombre/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("insumo-form-submit")).toBeInTheDocument();
  });
});
