import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage, ProductStatusBadge } from "@/features/catalog/product-page";
import { useProducts, usePaginatedProducts } from "@/features/catalog/use-product";
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
  it("renders active badge with high contrast emerald palette and dot indicator", () => {
    const { container } = render(<ProductStatusBadge isActive={true} />);
    const badge = screen.getByTestId("product-status-badge");

    expect(badge).toHaveTextContent("Activo");
    expect(badge.className).toContain("text-emerald-800");
    expect(badge.className).toContain("bg-emerald-50");

    // Accessible dot indicator
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain("bg-emerald-500");
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
  });

  it("formats prices and stock with tabular-nums", () => {
    renderPage();

    expect(screen.getByText("C$45.00")).toHaveClass("tabular-nums");
    expect(screen.getByText("120.00")).toHaveClass("tabular-nums");
  });
});
