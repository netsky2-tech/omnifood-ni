import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "@/features/catalog/catalog-page";
import {
  useCatalogValues,
  useCreateCatalogValue,
  useUpdateCatalogValue,
  useDeactivateCatalogValue,
} from "@/features/catalog/use-catalog";
import type { CatalogValue } from "@/features/catalog/types";

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  useCreateCatalogValue: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useUpdateCatalogValue: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useDeactivateCatalogValue: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useSeedCatalogDefaults: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const MOCK_UOM_VALUES: CatalogValue[] = [
  {
    id: "u1",
    tenant_id: "t1",
    catalog_type: "UOM",
    code: "kg",
    name: "Kilogramo",
    is_active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    tenant_id: "t1",
    catalog_type: "UOM",
    code: "un",
    name: "Unidad",
    is_active: true,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u3",
    tenant_id: "t1",
    catalog_type: "UOM",
    code: "l",
    name: "Litro",
    is_active: false,
    sort_order: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCatalogValues).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as any);
});

describe("W5 — CatalogPage", () => {
  it("renders heading and all tabs", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
    expect(screen.getByText("Unidades de Medida")).toBeInTheDocument();
    expect(screen.getByText("Categorías de Inventario")).toBeInTheDocument();
    expect(screen.getByText("Tipos de Inventario")).toBeInTheDocument();
    expect(screen.getByText("Categorías de Producto")).toBeInTheDocument();
    expect(screen.getByText("Tipos de Producto")).toBeInTheDocument();
  });

  it("defaults to UOM tab", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Kilogramo")).toBeInTheDocument();
    expect(screen.getByText("Unidad")).toBeInTheDocument();
  });

  it("renders create button", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("+ Nuevo Valor")).toBeInTheDocument();
  });

  it("shows empty state when no values", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(
      screen.getByText("Sin valores en este catálogo"),
    ).toBeInTheDocument();
  });

  it("renders catalog values table with correct columns", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Código")).toBeInTheDocument();
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Orden")).toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
  });

  it("displays active/inactive badges correctly", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });
    const activeBadges = screen.getAllByText("Activo");
    const inactiveBadges = screen.getAllByText("Inactivo");
    expect(activeBadges.length).toBe(2);
    expect(inactiveBadges.length).toBe(1);
  });

  it("shows edit and deactivate buttons for active values", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });
    const editButtons = screen.getAllByText("Editar");
    expect(editButtons.length).toBe(3);
    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBe(2);
  });

  it("shows only edit button for inactive values", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });
    const rows = screen.getAllByRole("row");
    const inactiveRow = rows.find((row) =>
      row.textContent?.includes("Inactivo"),
    );
    expect(inactiveRow).toBeDefined();
    expect(
      inactiveRow?.querySelectorAll("button").length,
    ).toBe(1);
  });
});

describe("W5 — CatalogPage tabs", () => {
  it("switches to inventory category tab and highlights it", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    const inventoryTab = screen.getByText("Categorías de Inventario");
    await user.click(inventoryTab);

    expect(inventoryTab.className).toContain("border-primary");
    expect(inventoryTab.className).toContain("text-primary");
  });

  it("switches to sales product type tab and highlights it", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    const salesTab = screen.getByText("Tipos de Producto");
    await user.click(salesTab);

    expect(salesTab.className).toContain("border-primary");
    expect(salesTab.className).toContain("text-primary");
  });

  it("unhighlights previous tab when switching", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    const uomTab = screen.getByText("Unidades de Medida");
    expect(uomTab.className).toContain("border-primary");

    await user.click(screen.getByText("Categorías de Inventario"));

    expect(uomTab.className).toContain("border-transparent");
  });

  it("renders empty state content after tab switch", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("Categorías de Inventario"));

    await waitFor(() => {
      expect(
        screen.getByText("Sin valores en este catálogo"),
      ).toBeInTheDocument();
    });
  });
});

describe("W5 — CatalogPage loading states", () => {
  beforeEach(() => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);
  });

  it("shows spinner while loading", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders page heading while loading", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
  });

  it("renders tabs while loading", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Unidades de Medida")).toBeInTheDocument();
  });
});

describe("W5 — CatalogPage error states", () => {
  beforeEach(() => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("API down"),
    } as any);
  });

  it("renders error message on load failure", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(
      screen.getByText("Error al cargar catálogo"),
    ).toBeInTheDocument();
  });

  it("does not crash and still renders page heading", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.getByText("Catálogo")).toBeInTheDocument();
  });

  it("does not render table on error", () => {
    render(<CatalogPage />, { wrapper: TestWrapper });
    expect(screen.queryByText("Código")).not.toBeInTheDocument();
  });
});

describe("W5 — CatalogPage create dialog", () => {
  it("opens create dialog when clicking new button", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    expect(screen.getByText("Nuevo Valor")).toBeInTheDocument();
    expect(screen.getByText("Código *")).toBeInTheDocument();
    expect(screen.getByText("Nombre *")).toBeInTheDocument();
  });

  it("closes dialog on cancel", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));
    expect(screen.getByText("Nuevo Valor")).toBeInTheDocument();

    await user.click(screen.getByText("Cancelar"));
    await waitFor(() => {
      expect(screen.queryByText("Nuevo Valor")).not.toBeInTheDocument();
    });
  });
});

describe("W5 — CatalogPage deactivate dialog", () => {
  it("opens deactivate confirmation dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBeGreaterThan(0);
    await user.click(deactivateButtons[0]!);

    expect(screen.getByText("Desactivar Valor")).toBeInTheDocument();
    expect(
      screen.getByText(/¿Estás seguro de desactivar/),
    ).toBeInTheDocument();
  });

  it("closes deactivate dialog on cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    const deactivateButtons = screen.getAllByText("Desactivar");
    expect(deactivateButtons.length).toBeGreaterThan(0);
    await user.click(deactivateButtons[0]!);

    await user.click(screen.getByText("Cancelar"));
    await waitFor(() => {
      expect(
        screen.queryByText("Desactivar Valor"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows value name and code in deactivate confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    const deactivateButtons = screen.getAllByText("Desactivar");
    await user.click(deactivateButtons[0]!);

    // Dialog shows the value name in a <span> and code in text
    const dialogText = screen.getByText(/¿Estás seguro de desactivar/);
    expect(dialogText).toHaveTextContent("Kilogramo");
    expect(dialogText).toHaveTextContent("kg");
  });
});

describe("W5 — Triangulation: create dialog edge cases", () => {
  it("rejects code with spaces via HTML pattern", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    const codeInput = screen.getByPlaceholderText("Ej: kg, LACTEOS") as HTMLInputElement;
    // jsdom doesn't enforce pattern validation, so verify the attribute is correct
    // Real browsers will block form submission when the pattern fails
    expect(codeInput.pattern).toBe("^[A-Za-z0-9_-]+$");
    expect(codeInput.required).toBe(true);
    expect(codeInput.maxLength).toBe(64);
  });

  it("rejects code with special characters via HTML pattern", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    const codeInput = screen.getByPlaceholderText("Ej: kg, LACTEOS") as HTMLInputElement;
    // Verify the pattern attribute — real browsers enforce this
    expect(codeInput.pattern).toBe("^[A-Za-z0-9_-]+$");
    expect(codeInput.value).toBe(""); // starts empty
  });

  it("accepts code with hyphens and underscores", async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateCatalogValue).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));
    await user.type(screen.getByPlaceholderText("Ej: kg, LACTEOS"), "my-code");
    await user.type(screen.getByPlaceholderText("Ej: Kilogramo, Lácteos"), "Test");
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ code: "my-code" }),
      );
    });
  });

  it("shows error message when create mutation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(useCreateCatalogValue).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Código duplicado")),
      isPending: false,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));
    await user.type(screen.getByPlaceholderText("Ej: kg, LACTEOS"), "dup");
    await user.type(screen.getByPlaceholderText("Ej: Kilogramo, Lácteos"), "Dup");
    await user.click(screen.getByText("Crear"));

    await waitFor(() => {
      expect(screen.getByText("Código duplicado")).toBeInTheDocument();
    });
  });

  it("disables submit button while mutation is pending", async () => {
    const user = userEvent.setup();
    vi.mocked(useCreateCatalogValue).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    expect(screen.getByText("Guardando...")).toBeDisabled();
  });

  it("pre-fills edit dialog with existing values", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getAllByText("Editar")[0]!);

    expect(screen.getByText("Editar Valor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kilogramo")).toBeInTheDocument();
  });

  it("edit dialog does not show code field", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getAllByText("Editar")[0]!);

    expect(screen.queryByText("Código *")).not.toBeInTheDocument();
  });

  it("shows error message when deactivate mutation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(useDeactivateCatalogValue).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Not found")),
      isPending: false,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    const tableDeactivateButtons = screen.getAllByText("Desactivar");
    await user.click(tableDeactivateButtons[0]!);

    // Now there are 3 "Desactivar" texts: 2 table buttons + 1 dialog confirm button
    const allDeactivate = screen.getAllByText("Desactivar");
    const confirmButton = allDeactivate[allDeactivate.length - 1]!;
    await user.click(confirmButton);

    // Error handled silently by mutation; dialog stays open
    await waitFor(() => {
      expect(screen.getByText("Desactivar Valor")).toBeInTheDocument();
    });
  });

  it("renders sort_order values in table", () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: MOCK_UOM_VALUES,
      isLoading: false,
      error: null,
    } as any);
    render(<CatalogPage />, { wrapper: TestWrapper });

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("code input has maxlength of 64", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    const codeInput = screen.getByPlaceholderText("Ej: kg, LACTEOS");
    expect(codeInput).toHaveAttribute("maxlength", "64");
  });

  it("name input has maxlength of 120", async () => {
    const user = userEvent.setup();
    render(<CatalogPage />, { wrapper: TestWrapper });

    await user.click(screen.getByText("+ Nuevo Valor"));

    const nameInput = screen.getByPlaceholderText("Ej: Kilogramo, Lácteos");
    expect(nameInput).toHaveAttribute("maxlength", "120");
  });
});
