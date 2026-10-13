import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage, ProductStatusBadge } from "@/features/catalog/product-page";
import { usePaginatedProducts } from "@/features/catalog/use-product";
import type { Product } from "@/features/catalog/product-types";

const mockProducts: Product[] = [
  {
    id: "p1",
    tenant_id: "t1",
    name: "Café Espresso Doble",
    uom: "taza",
    product_type: "SIMPLE",
    category_code: "BEBIDAS",
    warehouse_id: null,
    is_perishable: false,
    stock: 120.0,
    averageCost: 15.0,
    sellPrice: 45.0,
    is_active: true,
    image_url: "data:image/webp;base64,mockEspressoImage",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p2",
    tenant_id: "t1",
    name: "Tarta de Limón",
    uom: "porción",
    product_type: "SIMPLE",
    category_code: "POSTRES",
    warehouse_id: null,
    is_perishable: true,
    stock: 0.0,
    averageCost: 25.0,
    sellPrice: 65.0,
    is_active: false,
    image_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/features/catalog/use-product", () => {
  return {
    useProducts: vi.fn(),
    usePaginatedProducts: vi.fn(),
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
  };
});

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({
    data: [{ code: "taza", name: "Taza" }],
    isLoading: false,
    error: null,
  })),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductPage />
    </QueryClientProvider>,
  );
}

describe("S1 — ProductStatusBadge (NHILoS §26, §46)", () => {
  it("renders active badge with the strong lifecycle palette and dot indicator", () => {
    const { container } = render(<ProductStatusBadge isActive={true} />);
    const badge = screen.getByTestId("product-status-badge");

    expect(badge).toHaveTextContent("Activo");
    // Strong tint per user feedback: bg-emerald-50 read as gray on white.
    expect(badge.className).toContain("text-emerald-800");
    expect(badge.className).toContain("bg-emerald-100");
    expect(badge.className).toContain("border-emerald-300");

    // Accessible dot indicator
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain("bg-emerald-600");
  });

  it("renders inactive badge with muted neutral palette and dot indicator", () => {
    const { container } = render(<ProductStatusBadge isActive={false} />);
    const badge = screen.getByTestId("product-status-badge");

    expect(badge).toHaveTextContent("Inactivo");
    expect(badge.className).toContain("text-muted-foreground");

    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain("bg-muted-foreground");
  });
});

describe("S2 — Form Sanitization & Accessibility (NHILoS §18.2/§18.3, §30)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedProducts).mockReturnValue({
      data: {
        data: mockProducts,
        total: 2,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as any);
  });

  it("renders create form with noValidate attribute to prevent browser validation popups", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("+ Nuevo Producto"));
    await screen.findByText("Nuevo Producto");

    const form = document.querySelector("form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute("noValidate");
  });

  it("binds aria-invalid and aria-describedby when field errors occur", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("+ Nuevo Producto"));
    await screen.findByText("Nuevo Producto");

    // Select product type answer so form can submit
    await user.click(screen.getByLabelText("No, se compra y se revende tal cual"));

    // Submit with empty name and UOM
    await user.click(screen.getByText("Crear"));

    const nameInput = screen.getByPlaceholderText("Ej: Taza de Capuccino");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "name-error");

    const errorMsg = screen.getByText("El nombre es obligatorio");
    expect(errorMsg).toHaveAttribute("id", "name-error");
    expect(errorMsg).toHaveAttribute("role", "alert");

    const uomSelect = screen.getByLabelText(/Unidad de Medida/i);
    expect(uomSelect).toHaveAttribute("aria-invalid", "true");
    expect(uomSelect).toHaveAttribute("aria-describedby", "uom-error");

    const uomErrorMsg = screen.getByText("La unidad de medida es obligatoria");
    expect(uomErrorMsg).toHaveAttribute("id", "uom-error");
    expect(uomErrorMsg).toHaveAttribute("role", "alert");
  });
});

describe("S3 — NHILoS Backoffice Experience Layout & Luxury (NHILoS §7, §41)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedProducts).mockReturnValue({
      data: {
        data: mockProducts,
        total: 2,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as any);
  });

  it("renders standard executive summary cards above product table", () => {
    renderPage();

    expect(screen.getByTestId("product-summary-cards")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Activos")).toBeInTheDocument();
    expect(screen.getByText("Inactivos")).toBeInTheDocument();
    expect(screen.getByText("Con Receta")).toBeInTheDocument();
  });

  it("provides search input with clear action button", async () => {
    const user = userEvent.setup();
    renderPage();

    const searchInput = screen.getByPlaceholderText("Buscar por nombre o UOM...");
    await user.type(searchInput, "Espresso");
    expect(searchInput).toHaveValue("Espresso");

    const clearButton = screen.getByLabelText("Limpiar búsqueda");
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);
    expect(searchInput).toHaveValue("");
    expect(screen.queryByLabelText("Limpiar búsqueda")).not.toBeInTheDocument();
  });

  it("formats prices and stock with tabular-nums", () => {
    renderPage();

    expect(screen.getByText("C$45.00")).toHaveClass("tabular-nums");
    expect(screen.getByText("120.00")).toHaveClass("tabular-nums");
  });

  it("renders product image thumbnail when present and monogram fallback when absent (S4)", () => {
    renderPage();

    const img = screen.getByTestId("product-table-thumbnail");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/webp;base64,mockEspressoImage");

    const monogram = screen.getByTestId("product-table-monogram");
    expect(monogram).toBeInTheDocument();
    expect(monogram).toHaveTextContent("TA");
  });

  it("offers Reactivar for inactive products and calls the update hook with is_active: true (S4)", async () => {
    const { useUpdateProduct } = await import("@/features/catalog/use-product");
    const updateMutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateProduct).mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as any);

    const user = userEvent.setup();
    renderPage();

    const inactiveRow = screen.getByText("Tarta de Limón").closest("tr");
    expect(inactiveRow).not.toBeNull();

    // Active product has no Reactivar; inactive one does.
    expect(within(inactiveRow!).getByRole("button", { name: /Reactivar/i })).toBeInTheDocument();

    await user.click(within(inactiveRow!).getByRole("button", { name: /Reactivar/i }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(updateMutateAsync.mock.calls[0]![0]).toEqual({
      id: "p2",
      input: { is_active: true },
    });
  });
});

describe("S1 — Edit dialog prefill (honest display, async catalog options)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedProducts).mockReturnValue({
      data: {
        data: mockProducts,
        total: 2,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
      isLoading: false,
      error: null,
    } as any);
  });

  it("shows the saved UOM selected even when the catalog does not list it (synthetic current option)", async () => {
    // Catalog only knows "taza"; the saved product uses "porción".
    const user = userEvent.setup();
    renderPage();

    await user.click(within(screen.getByText("Tarta de Limón").closest("tr")!).getByRole("button", { name: /Editar/i }));
    await screen.findByText("Editar Producto");

    const uomSelect = screen.getByLabelText(/Unidad de Medida/i) as HTMLSelectElement;
    expect(uomSelect.value).toBe("porción");
    expect(screen.getByText(/porción \(valor actual\)/i)).toBeInTheDocument();
  });

  it("shows the saved category selected even when the catalog does not list it", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(screen.getByText("Tarta de Limón").closest("tr")!).getByRole("button", { name: /Editar/i }));
    await screen.findByText("Editar Producto");

    const categorySelect = screen.getByLabelText(/Categoría/i) as HTMLSelectElement;
    expect(categorySelect.value).toBe("POSTRES");
    expect(screen.getByText(/POSTRES \(valor actual\)/i)).toBeInTheDocument();
  });
});

describe("S2 — Schema aligned with backend DTO", () => {
  it("refuses a uom longer than 32 characters with the app's Spanish message", async () => {
    const { productFormSchema } = await import("@/features/catalog/product-types");

    const result = productFormSchema.safeParse({
      name: "Producto Válido",
      uom: "x".repeat(33),
      sellPrice: 10,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe(
        "La unidad de medida no debe exceder 32 caracteres",
      );
    }
  });

  it("accepts a uom of exactly 32 characters", () => {
    return import("@/features/catalog/product-types").then(({ productFormSchema }) => {
      const result = productFormSchema.safeParse({
        name: "Producto Válido",
        uom: "x".repeat(32),
        sellPrice: 10,
      });
      expect(result.success).toBe(true);
    });
  });
});
