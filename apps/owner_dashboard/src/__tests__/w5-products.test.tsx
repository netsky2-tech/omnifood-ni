import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage } from "@/features/catalog/product-page";
import { useProducts } from "@/features/catalog/use-product";
import type { Product } from "@/features/catalog/product-types";

const mocks = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

vi.mock("@/features/catalog/use-product", () => {
  const useProductsMock = vi.fn((_type?: string, _inactive?: boolean) => ({
    data: [] as Product[],
    isLoading: false,
    error: null,
  }));
  const usePaginatedProductsMock = vi.fn((params: any) => {
    const prodRes = useProductsMock(params?.productType, true) as any;
    const rawData = Array.isArray(prodRes?.data) ? prodRes.data : [];
    return {
      data: prodRes?.isLoading ? undefined : {
        data: rawData,
        total: rawData.length,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 25,
        totalPages: Math.max(1, Math.ceil(rawData.length / 25)),
      },
      isLoading: prodRes?.isLoading ?? false,
      error: prodRes?.error ?? null,
    };
  });

  return {
    useProducts: useProductsMock,
    usePaginatedProducts: usePaginatedProductsMock,
    useCreateProduct: vi.fn(() => ({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
    })),
    useUpdateProduct: vi.fn(() => ({
      mutateAsync: mocks.updateMutateAsync,
      isPending: false,
    })),
    useDeactivateProduct: vi.fn(() => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    })),
  };
});

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({
    data: [{ code: "un", name: "Unidad" }],
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

describe("W5 — ProductPage form validation (unit B, form sweep)", () => {
  beforeEach(() => {
    mocks.createMutateAsync.mockReset().mockResolvedValue({});
    mocks.updateMutateAsync.mockReset().mockResolvedValue({});
  });

  function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
      id: "p1",
      tenant_id: "t1",
      name: "Plato del Día",
      uom: "un",
      product_type: "COMPOUND",
      category_code: null,
      warehouse_id: null,
      is_perishable: false,
      stock: 0,
      averageCost: 25,
      sellPrice: 45,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  async function openCreateDialog() {
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });
    await user.click(screen.getByText("+ Nuevo Producto"));
    await screen.findByText("Nuevo Producto");
    return user;
  }

  async function openEditDialog(product: Product) {
    vi.mocked(useProducts).mockReturnValue({
      data: [product],
      isLoading: false,
      error: null,
    } as any);
    const user = userEvent.setup();
    render(<ProductPage />, { wrapper: TestWrapper });
    await screen.findByText(product.name);
    await user.click(screen.getByText("Editar"));
    await screen.findByText("Editar Producto");
    return user;
  }

  // RED/GREEN core: today the dialog is native-only — jsdom fires the submit
  // event regardless of constraint validity, so an empty required name/UOM
  // reaches the API and the app's Spanish message never renders.
  it("create: an empty name shows the app's Spanish message and does not call the API", async () => {
    const user = await openCreateDialog();
    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));
    await user.selectOptions(screen.getAllByRole("combobox")[0]!, "un");
    expect(screen.getByText("Crear")).toBeEnabled();

    await user.click(screen.getByText("Crear"));

    expect(screen.getByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });

  it("create: an empty UOM shows the app's Spanish message and does not call the API", async () => {
    const user = await openCreateDialog();
    await user.type(
      screen.getByPlaceholderText("Ej: Taza de Capuccino"),
      "Producto Nuevo",
    );
    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));
    expect(screen.getByText("Crear")).toBeEnabled();

    await user.click(screen.getByText("Crear"));

    expect(
      screen.getByText("La unidad de medida es obligatoria"),
    ).toBeInTheDocument();
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });

  // One test per native attribute so "no guard was lost" is verifiable.
  // Native maxLength={200} (jsdom keeps a programmatically set overlong value,
  // as a browser does for the constraint) must map to a schema maximum.
  it("a name longer than 200 characters is refused with the app's Spanish message", async () => {
    const user = await openEditDialog(makeProduct());
    fireEvent.change(screen.getByPlaceholderText("Ej: Taza de Capuccino"), {
      target: { value: "x".repeat(201) },
    });

    await user.click(screen.getByText("Guardar"));

    expect(
      screen.getByText("El nombre no debe exceder 200 caracteres"),
    ).toBeInTheDocument();
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });

  // Native min="0" on the price input.
  it("a negative sellPrice is refused with the app's Spanish message", async () => {
    const user = await openEditDialog(makeProduct());
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "-5" },
    });

    await user.click(screen.getByText("Guardar"));

    expect(
      screen.getByText("El precio de venta debe ser mayor o igual a 0"),
    ).toBeInTheDocument();
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });

  // Native step="0.01": a value with more than 2 decimals never passed
  // constraint validation in a real browser; the schema must keep that guard.
  it("a sellPrice with more than 2 decimals is refused with the app's Spanish message", async () => {
    const user = await openEditDialog(makeProduct());
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "1.234" },
    });

    await user.click(screen.getByText("Guardar"));

    expect(
      screen.getByText("El precio de venta no puede tener más de 2 decimales"),
    ).toBeInTheDocument();
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });

  // Triangulation (additive-only contract): native `required` only blocked the
  // empty string, so a whitespace-only name was valid today and MUST stay
  // valid — the payload keeps trimming, exactly as before the schema existed.
  it("a whitespace-only name stays valid and submits the trimmed payload as before", async () => {
    const user = await openCreateDialog();
    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));
    await user.selectOptions(screen.getAllByRole("combobox")[0]!, "un");
    await user.type(screen.getByPlaceholderText("Ej: Taza de Capuccino"), "   ");
    expect(screen.getByText("Crear")).toBeEnabled();

    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createMutateAsync.mock.calls[0]![0]).toEqual({
      name: "",
      uom: "un",
      product_type: "SIMPLE",
      category_code: undefined,
      sellPrice: 0,
      is_perishable: false,
    });
  });

  // Regression trap: sellPrice = 0 is legal today and MUST stay legal, with
  // the exact same payload shape as before the schema existed.
  it("sellPrice = 0 stays valid and submits the exact same update payload", async () => {
    const user = await openEditDialog(makeProduct());
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "0" },
    });

    await user.click(screen.getByText("Guardar"));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mocks.updateMutateAsync.mock.calls[0]![0]).toEqual({
      id: "p1",
      input: {
        name: "Plato del Día",
        uom: "un",
        product_type: "COMPOUND",
        category_code: undefined,
        sellPrice: 0,
        is_perishable: false,
      },
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
