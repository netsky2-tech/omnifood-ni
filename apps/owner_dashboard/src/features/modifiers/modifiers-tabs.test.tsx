import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModifiersPage } from "./modifiers-page";
import { type ModifierGroup } from "./types";
import { type EffectiveModifierGroup } from "./effective-types";
import {
  useModifierGroups,
  useGroupsByCategory,
  useAttachCategory,
  useDetachCategory,
  useEffectiveGroups,
  useAttachProduct,
  useDetachProduct,
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useDeactivateModifierGroup,
} from "./use-modifiers";
import { useCatalogValues } from "@/features/catalog/use-catalog";
import { useProducts } from "@/features/catalog/use-product";
import { toast } from "@/hooks/use-toast";

vi.mock("./use-modifiers");
vi.mock("@/hooks/use-toast");
vi.mock("@/features/catalog/use-catalog");
vi.mock("@/features/catalog/use-product");
vi.mock("@/lib/rbac", () => ({
  useRbac: () => ({ canPerformAction: () => true }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const mockGroups: ModifierGroup[] = [
  {
    id: "group-1",
    name: "Leche",
    min_selected: 1,
    max_selected: 1,
    allow_quantities: false,
    sort_order: 1,
    is_active: true,
    options: [],
  },
  {
    id: "group-2",
    name: "Extras",
    min_selected: 0,
    max_selected: 3,
    allow_quantities: true,
    sort_order: 2,
    is_active: true,
    options: [],
  },
];

const mockCategories = [
  {
    id: "cat-bebidas",
    tenant_id: "tenant-A",
    catalog_type: "SALES_PRODUCT_CATEGORY",
    code: "BEBIDAS",
    name: "Bebidas",
    is_active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cat-postres",
    tenant_id: "tenant-A",
    catalog_type: "SALES_PRODUCT_CATEGORY",
    code: "POSTRES",
    name: "Postres",
    is_active: false,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockProducts = [
  {
    id: "prod-1",
    tenant_id: "tenant-A",
    name: "Cerveza Toña",
    uom: "UN",
    product_type: "SIMPLE",
    category_code: "BEBIDAS",
    warehouse_id: null,
    is_perishable: false,
    stock: 10,
    averageCost: 0,
    sellPrice: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "prod-2",
    tenant_id: "tenant-A",
    name: "Pinolero",
    uom: "UN",
    product_type: "SIMPLE",
    category_code: null,
    warehouse_id: null,
    is_perishable: false,
    stock: 10,
    averageCost: 0,
    sellPrice: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
] as any[];

const openTab = (label: string) => {
  fireEvent.click(screen.getByRole("tab", { name: label }));
};

describe("ModifiersPage tabs", () => {
  const mockAttachCategory = { mutateAsync: vi.fn(), isPending: false };
  const mockDetachCategory = { mutateAsync: vi.fn(), isPending: false };
  const mockAttachProduct = { mutateAsync: vi.fn(), isPending: false };
  const mockDetachProduct = { mutateAsync: vi.fn(), isPending: false };

  let effectiveData: EffectiveModifierGroup[];

  beforeEach(() => {
    vi.clearAllMocks();
    effectiveData = [
      {
        group_id: "group-1",
        name: "Leche",
        min_selected: 1,
        max_selected: 1,
        allow_quantities: false,
        source: "category",
        options: [],
      },
      {
        group_id: "group-2",
        name: "Extras",
        min_selected: 0,
        max_selected: 3,
        allow_quantities: true,
        source: "product",
        options: [],
      },
    ];
    (useModifierGroups as any).mockReturnValue({
      data: mockGroups,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useGroupsByCategory as any).mockReturnValue({
      data: [mockGroups[0]],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useAttachCategory as any).mockReturnValue(mockAttachCategory);
    (useDetachCategory as any).mockReturnValue(mockDetachCategory);
    (useEffectiveGroups as any).mockImplementation(() => ({
      data: effectiveData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));
    (useAttachProduct as any).mockReturnValue(mockAttachProduct);
    (useDetachProduct as any).mockReturnValue(mockDetachProduct);
    (useCreateModifierGroup as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useUpdateModifierGroup as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useDeactivateModifierGroup as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useCreateModifierOption as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useUpdateModifierOption as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useDeactivateModifierOption as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useCatalogValues as any).mockReturnValue({ data: mockCategories });
    (useProducts as any).mockReturnValue({
      data: mockProducts,
      isLoading: false,
    });
    (toast as any).mockImplementation(vi.fn());
  });

  describe("Por categoría", () => {
    const selectCategory = () => {
      render(<ModifiersPage />);
      openTab("Por categoría");
      fireEvent.change(screen.getByLabelText("Categoría"), {
        target: { value: "cat-bebidas" },
      });
    };

    it("queries the category groups when a category is selected and marks inactive ones", () => {
      selectCategory();

      expect(useGroupsByCategory).toHaveBeenCalledWith("cat-bebidas");
      expect(screen.getByText("Leche")).toBeInTheDocument();
      // Inactive categories are visible and marked, never silent.
      const postresOption = screen.getByRole("option", { name: /Postres/ });
      expect(postresOption.textContent).toMatch(/inactiva/i);
    });

    it("attaches an available group with append-at-end sort order", async () => {
      mockAttachCategory.mutateAsync.mockResolvedValue({});
      selectCategory();

      fireEvent.click(screen.getByLabelText("Agregar grupo Extras"));
      await waitFor(() => {
        expect(mockAttachCategory.mutateAsync).toHaveBeenCalledWith({
          groupId: "group-2",
          catalogValueId: "cat-bebidas",
          // Append at end: one group currently attached.
          sortOrder: 1,
        });
      });
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Grupo agregado a la categoría" }),
      );
    });

    it("maps a failed attach to a plain Spanish message", async () => {
      mockAttachCategory.mutateAsync.mockRejectedValue({
        status: 400,
        responseBody: {
          message: "catalog_value_id ... not a product category",
        },
      });
      selectCategory();

      fireEvent.click(screen.getByLabelText("Agregar grupo Extras"));
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            description:
              "Revise los datos del formulario: hay valores que no son válidos",
          }),
        );
      });
    });

    it("detaches only after explicit confirmation", async () => {
      mockDetachCategory.mutateAsync.mockResolvedValue({ success: true });
      selectCategory();

      fireEvent.click(screen.getByLabelText("Quitar Leche de la categoría"));
      expect(mockDetachCategory.mutateAsync).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "Quitar grupo de la categoría" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Quitar grupo" }));
      await waitFor(() => {
        expect(mockDetachCategory.mutateAsync).toHaveBeenCalledWith({
          groupId: "group-1",
          catalogValueId: "cat-bebidas",
        });
      });
    });
  });

  describe("Por producto", () => {
    const selectProduct = () => {
      render(<ModifiersPage />);
      openTab("Por producto");
      fireEvent.change(screen.getByLabelText("Producto"), {
        target: { value: "prod-1" },
      });
    };

    it("splits the effective groups into inherited (no remove) and exceptions (with remove)", () => {
      selectProduct();

      expect(useEffectiveGroups).toHaveBeenCalledWith("prod-1");
      const inheritedSection = screen
        .getByText("Heredado de la categoría")
        .closest("div");
      expect(inheritedSection?.textContent).toContain("Leche");
      expect(inheritedSection?.textContent).toContain("Heredado");
      // Inherited rows are read-only: no remove action inside the section.
      expect(
        screen.queryByLabelText("Quitar Leche de este producto"),
      ).not.toBeInTheDocument();

      expect(
        screen.getByText("Excepciones de este producto"),
      ).toBeInTheDocument();
      expect(screen.getByText("De este producto")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Quitar Extras de este producto"),
      ).toBeInTheDocument();
    });

    it("offers inherited groups as explicit exceptions and explains the override", async () => {
      mockAttachProduct.mutateAsync.mockResolvedValue({});
      selectProduct();

      // Helper line explains the product-wins behavior in plain Spanish.
      expect(
        screen.getByText(/usará su propia configuración del grupo/i),
      ).toBeInTheDocument();
      // The picker includes BOTH never-attached and inherited groups.
      fireEvent.change(screen.getByLabelText("Grupo"), {
        target: { value: "group-1" },
      });
      fireEvent.click(screen.getByLabelText("Agregar como excepción"));

      await waitFor(() => {
        expect(mockAttachProduct.mutateAsync).toHaveBeenCalledWith({
          groupId: "group-1",
          productId: "prod-1",
          sortOrder: 1,
        });
      });
    });

    it("moves an inherited group into the exceptions section after it is added", async () => {
      mockAttachProduct.mutateAsync.mockResolvedValue({});
      const view = render(<ModifiersPage />);
      openTab("Por producto");
      fireEvent.change(screen.getByLabelText("Producto"), {
        target: { value: "prod-1" },
      });
      fireEvent.change(screen.getByLabelText("Grupo"), {
        target: { value: "group-1" },
      });
      fireEvent.click(screen.getByLabelText("Agregar como excepción"));
      await waitFor(() => {
        expect(mockAttachProduct.mutateAsync).toHaveBeenCalled();
      });

      // Simulated refetch: Leche now comes back with source 'product'.
      effectiveData = [
        {
          group_id: "group-1",
          name: "Leche",
          min_selected: 1,
          max_selected: 1,
          allow_quantities: false,
          source: "product",
          options: [],
        },
      ];
      view.rerender(<ModifiersPage />);

      const exceptionsSection = screen
        .getByText("Excepciones de este producto")
        .closest("div");
      expect(exceptionsSection?.textContent).toContain("Leche");
      expect(exceptionsSection?.textContent).toContain("De este producto");
      expect(
        screen.getByLabelText("Quitar Leche de este producto"),
      ).toBeInTheDocument();
    });

    it("removes an exception only after confirmation", async () => {
      mockDetachProduct.mutateAsync.mockResolvedValue({ success: true });
      selectProduct();

      fireEvent.click(screen.getByLabelText("Quitar Extras de este producto"));
      expect(mockDetachProduct.mutateAsync).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "Quitar grupo del producto" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Quitar grupo" }));
      await waitFor(() => {
        expect(mockDetachProduct.mutateAsync).toHaveBeenCalledWith({
          groupId: "group-2",
          productId: "prod-1",
        });
      });
    });

    it("filters the product selector by search text", () => {
      render(<ModifiersPage />);
      openTab("Por producto");

      fireEvent.change(screen.getByLabelText("Buscar producto"), {
        target: { value: "Cerve" },
      });
      const options = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(options.some((text) => text?.includes("Cerveza Toña"))).toBe(true);
      expect(options.some((text) => text?.includes("Pinolero"))).toBe(false);
    });

    it("shows a friendly empty state when the product has no groups", () => {
      effectiveData = [];
      selectProduct();

      expect(
        screen.getByText(/este producto aún no tiene grupos/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/pestaña «Grupos»/i)).toBeInTheDocument();
    });
  });
});
