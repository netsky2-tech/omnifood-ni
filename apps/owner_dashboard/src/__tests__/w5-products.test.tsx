import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage } from "@/features/catalog/product-page";
import { useProducts } from "@/features/catalog/use-product";
import type { Product } from "@/features/catalog/product-types";

vi.mock("@/features/catalog/use-product", () => ({
  useProducts: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  useCreateProduct: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useUpdateProduct: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useDeactivateProduct: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
}));

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({
    data: [],
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

const MOCK_PRODUCTS: Product[] = [
  {
    id: "p1",
    tenant_id: "t1",
    name: "Taza de Capuccino",
    uom: "un",
    product_type: "COMPOUND",
    category_code: "BEBIDA_CALIENTE",
    warehouse_id: null,
    is_perishable: false,
    stock: 0,
    averageCost: 25.0,
    sellPrice: 45.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p2",
    tenant_id: "t1",
    name: "Lata de Gaseosa",
    uom: "un",
    product_type: "SIMPLE",
    category_code: "BEBIDAS",
    warehouse_id: null,
    is_perishable: false,
    stock: 50,
    averageCost: 15.0,
    sellPrice: 25.0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p3",
    tenant_id: "t1",
    name: "Camisa Oxford",
    uom: "un",
    product_type: "VARIANT_PARENT",
    category_code: "RETAIL",
    warehouse_id: null,
    is_perishable: false,
    stock: 0,
    averageCost: 200.0,
    sellPrice: 350.0,
    is_active: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProducts).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as any);
});

describe("W5 — ProductPage", () => {
  it("renders heading and all tabs", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Productos")).toBeInTheDocument();
    expect(screen.getByText("Simple")).toBeInTheDocument();
    expect(screen.getByText("Compuesto (con receta)")).toBeInTheDocument();
    expect(screen.getByText("Padre de Variantes")).toBeInTheDocument();
  });

  it("defaults to SIMPLE tab", () => {
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Lata de Gaseosa")).toBeInTheDocument();
  });

  it("renders create button", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("+ Nuevo Producto")).toBeInTheDocument();
  });

  it("shows empty state when no products", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(
      screen.getByText("Sin productos en esta categoría"),
    ).toBeInTheDocument();
  });

  it("renders products table with correct columns", () => {
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.getByText("UOM")).toBeInTheDocument();
    expect(screen.getByText("Precio")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
  });

  it("displays active/inactive badges correctly", () => {
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("shows edit and deactivate buttons for active products", () => {
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });
    const editButtons = screen.getAllByText("Editar");
    expect(editButtons.length).toBe(1);
    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBe(1);
  });
});

describe("W5 — ProductPage tabs", () => {
  it("switches to compound tab and highlights it", async () => {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });

    const compoundTab = screen.getByText("Compuesto (con receta)");
    await user.click(compoundTab);

    expect(compoundTab.className).toContain("border-primary");
    expect(compoundTab.className).toContain("text-primary");
  });

  it("switches to variant parent tab and highlights it", async () => {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });

    const variantTab = screen.getByText("Padre de Variantes");
    await user.click(variantTab);

    expect(variantTab.className).toContain("border-primary");
    expect(variantTab.className).toContain("text-primary");
  });

  it("unhighlights previous tab when switching", async () => {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });

    const simpleTab = screen.getByText("Simple");
    expect(simpleTab.className).toContain("border-primary");

    await user.click(screen.getByText("Compuesto (con receta)"));

    expect(simpleTab.className).toContain("border-transparent");
  });
});

describe("W5 — ProductPage loading states", () => {
  beforeEach(() => {
    vi.mocked(useProducts).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);
  });

  it("shows spinner while loading", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders page heading while loading", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Productos")).toBeInTheDocument();
  });

  it("renders tabs while loading", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Simple")).toBeInTheDocument();
  });
});

describe("W5 — ProductPage error states", () => {
  beforeEach(() => {
    vi.mocked(useProducts).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("API down"),
    } as any);
  });

  it("renders error message on load failure", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(
      screen.getByText("Error al cargar productos"),
    ).toBeInTheDocument();
  });

  it("does not crash and still renders page heading", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Productos")).toBeInTheDocument();
  });

  it("does not render table on error", () => {
    render(<ProductPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Nombre")).not.toBeInTheDocument();
  });
});

describe("W5 — ProductPage create dialog", () => {
  it("opens create dialog when clicking new button", async () => {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Producto"));

    expect(screen.getByText("Nuevo Producto")).toBeInTheDocument();
    expect(screen.getByText("Nombre *")).toBeInTheDocument();
    expect(screen.getByText("Unidad de Medida *")).toBeInTheDocument();
  });

  it("closes dialog on cancel", async () => {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Producto"));
    expect(screen.getByText("Nuevo Producto")).toBeInTheDocument();

    await user.click(screen.getByText("Cancelar"));
    await waitFor(() => {
      expect(screen.queryByText("Nuevo Producto")).not.toBeInTheDocument();
    });
  });
});

describe("W5 — ProductPage deactivate dialog", () => {
  it("opens deactivate confirmation dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });

    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBeGreaterThan(0);
    await user.click(deactivateButtons[0]!);

    expect(screen.getByText("Desactivar Producto")).toBeInTheDocument();
    expect(
      screen.getByText(/¿Estás seguro de desactivar/),
    ).toBeInTheDocument();
  });

  it("closes deactivate dialog on cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(useProducts).mockReturnValue({
      data: MOCK_PRODUCTS.filter((p) => p.product_type === "SIMPLE"),
      isLoading: false,
      error: null,
    } as any);
    render(<ProductPage />, { wrapper: TestWrapper });

    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBeGreaterThan(0);
    await user.click(deactivateButtons[0]!);

    await user.click(screen.getByText("Cancelar"));
    await waitFor(() => {
      expect(
        screen.queryByText("Desactivar Producto"),
      ).not.toBeInTheDocument();
    });
  });
});
