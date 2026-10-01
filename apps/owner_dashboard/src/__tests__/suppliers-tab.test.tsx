import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuppliersTab } from "@/features/inventory/suppliers-tab";
import { InventoryPage } from "@/features/inventory/inventory-page";
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  usePurchases,
  useValuation,
  useCogs,
  useKardex,
  useAlerts,
} from "@/features/inventory/use-inventory-reports";
import type { SupplierItem } from "@/features/inventory/types";

vi.mock("@/features/inventory/use-inventory-reports", () => ({
  useSuppliers: vi.fn(),
  useCreateSupplier: vi.fn(),
  useUpdateSupplier: vi.fn(),
  usePurchases: vi.fn(),
  useValuation: vi.fn(),
  useCogs: vi.fn(),
  useKardex: vi.fn(),
  useAlerts: vi.fn(),
}));

vi.mock("@/features/recipes/use-recipes", () => ({
  useInsumos: vi.fn(() => ({ data: [] })),
  useCreateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
  },
}));

const mockSuppliers: SupplierItem[] = [
  {
    id: "sup-1",
    name: "Distribuidora La Famosa",
    contact_person: "Carlos Mendoza",
    phone: "8888-1111",
    credit_terms: "30 días",
    is_active: true,
  },
  {
    id: "sup-2",
    name: "Carnes San Martín",
    contact_person: "Ana Ramos",
    phone: "2222-3333",
    credit_terms: null,
    is_active: true,
  },
  {
    id: "sup-3",
    name: "Lácteos del Campo",
    contact_person: null,
    phone: null,
    credit_terms: null,
    is_active: false,
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SuppliersTab (SOHO office master data - BXW-001)", () => {
  const mockMutateCreate = vi.fn();
  const mockMutateUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useSuppliers).mockReturnValue({
      data: mockSuppliers,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useSuppliers>);

    vi.mocked(useCreateSupplier).mockReturnValue({
      mutateAsync: mockMutateCreate,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateSupplier>);

    vi.mocked(useUpdateSupplier).mockReturnValue({
      mutateAsync: mockMutateUpdate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateSupplier>);

    vi.mocked(useValuation).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useValuation>);
    vi.mocked(useCogs).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useCogs>);
    vi.mocked(useKardex).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useKardex>);
    vi.mocked(useAlerts).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof useAlerts>);
    vi.mocked(usePurchases).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<typeof usePurchases>);
  });

  it("renders loading state while fetching suppliers", () => {
    vi.mocked(useSuppliers).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useSuppliers>);

    renderWithClient(<SuppliersTab />);
    expect(screen.getByText("Cargando catálogo de proveedores...")).toBeInTheDocument();
  });

  it("renders error alert when query fails", () => {
    vi.mocked(useSuppliers).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error loading suppliers"),
    } as unknown as ReturnType<typeof useSuppliers>);

    renderWithClient(<SuppliersTab />);
    expect(screen.getByText("Network error loading suppliers")).toBeInTheDocument();
  });

  it("renders empty state with action when catalog has no suppliers", () => {
    vi.mocked(useSuppliers).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useSuppliers>);

    renderWithClient(<SuppliersTab />);
    expect(screen.getByText("Catálogo de proveedores vacío")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Registrar primer proveedor/i }),
    ).toBeInTheDocument();
  });

  it("renders supplier metrics and table rows faithfully", () => {
    renderWithClient(<SuppliersTab />);

    // Stat cards
    expect(screen.getByText("Total Proveedores")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Proveedores Activos")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Con Crédito Comercial")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    // Table rows
    expect(screen.getByText("Distribuidora La Famosa")).toBeInTheDocument();
    expect(screen.getByText("Carlos Mendoza")).toBeInTheDocument();
    expect(screen.getByText("8888-1111")).toBeInTheDocument();
    expect(screen.getByText("30 días")).toBeInTheDocument();

    expect(screen.getByText("Carnes San Martín")).toBeInTheDocument();
    expect(screen.getByText("Ana Ramos")).toBeInTheDocument();
    expect(screen.getByText("2222-3333")).toBeInTheDocument();
  });

  it("satisfies §26: active badge is success, inactive badge is secondary (never destructive)", () => {
    renderWithClient(<SuppliersTab />);

    const activeBadges = screen.getAllByText("Activo");
    expect(activeBadges).toHaveLength(2);
    for (const badge of activeBadges) {
      expect(badge.className).toContain("bg-emerald-50");
    }

    const inactiveBadge = screen.getByText("Inactivo");
    expect(inactiveBadge).toBeInTheDocument();
    expect(inactiveBadge.className).toContain("bg-muted");
    expect(inactiveBadge.className).not.toContain("bg-red-50");
  });

  it("filters suppliers by search input", async () => {
    const user = userEvent.setup();
    renderWithClient(<SuppliersTab />);

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i);
    await user.type(searchInput, "Carnes");

    expect(screen.getByText("Carnes San Martín")).toBeInTheDocument();
    expect(screen.queryByText("Distribuidora La Famosa")).not.toBeInTheDocument();
    expect(screen.queryByText("Lácteos del Campo")).not.toBeInTheDocument();
  });

  it("opens create modal and enforces required name (§17/§40)", async () => {
    const user = userEvent.setup();
    renderWithClient(<SuppliersTab />);

    const newBtn = screen.getByRole("button", { name: /Nuevo Proveedor/i });
    await user.click(newBtn);

    expect(screen.getByRole("heading", { name: "Nuevo Proveedor" })).toBeInTheDocument();

    // Try submit with blank name
    const submitBtn = screen.getByRole("button", { name: "Crear Proveedor" });
    await user.click(submitBtn);

    expect(mockMutateCreate).not.toHaveBeenCalled();

    // Fill valid name and submit
    const nameInput = screen.getByLabelText(/Nombre Comercial/i);
    await user.type(nameInput, "Panadería La Unión");

    await user.click(submitBtn);

    expect(mockMutateCreate).toHaveBeenCalledWith({
      name: "Panadería La Unión",
      contactPerson: undefined,
      phone: undefined,
      creditTerms: undefined,
    });
  });

  it("opens edit modal with existing supplier data and saves changes", async () => {
    const user = userEvent.setup();
    renderWithClient(<SuppliersTab />);

    const editBtn = screen.getByRole("button", {
      name: "Editar proveedor Distribuidora La Famosa",
    });
    await user.click(editBtn);

    expect(screen.getByRole("heading", { name: "Editar Proveedor" })).toBeInTheDocument();

    const phoneInput = screen.getByLabelText(/Teléfono \/ WhatsApp/i);
    expect(phoneInput).toHaveValue("8888-1111");

    await user.clear(phoneInput);
    await user.type(phoneInput, "7777-9999");

    const saveBtn = screen.getByRole("button", { name: "Guardar Cambios" });
    await user.click(saveBtn);

    expect(mockMutateUpdate).toHaveBeenCalledWith({
      id: "sup-1",
      input: {
        name: "Distribuidora La Famosa",
        contactPerson: "Carlos Mendoza",
        phone: "7777-9999",
        creditTerms: "30 días",
      },
    });
  });

  it("opens confirmation dialog when deactivating an active supplier", async () => {
    const user = userEvent.setup();
    renderWithClient(<SuppliersTab />);

    const deactivateBtn = screen.getByRole("button", {
      name: "Desactivar proveedor Distribuidora La Famosa",
    });
    await user.click(deactivateBtn);

    expect(screen.getByRole("heading", { name: "¿Desactivar proveedor?" })).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirmar Desactivación" });
    await user.click(confirmBtn);

    expect(mockMutateUpdate).toHaveBeenCalledWith({
      id: "sup-1",
      input: {
        isActive: false,
      },
    });
  });

  it("reactivates an inactive supplier directly", async () => {
    const user = userEvent.setup();
    renderWithClient(<SuppliersTab />);

    const reactivateBtn = screen.getByRole("button", {
      name: "Reactivar proveedor Lácteos del Campo",
    });
    await user.click(reactivateBtn);

    expect(mockMutateUpdate).toHaveBeenCalledWith({
      id: "sup-3",
      input: {
        isActive: true,
      },
    });
  });

  it("registers Proveedores tab in InventoryPage navigation", () => {
    renderWithClient(<InventoryPage />);

    const suppliersTab = screen.getByRole("tab", { name: "Proveedores" });
    expect(suppliersTab).toBeInTheDocument();
  });
});
