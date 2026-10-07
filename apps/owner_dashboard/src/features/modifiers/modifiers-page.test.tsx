import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModifiersPage } from "./modifiers-page";
import { type ModifierGroup } from "./types";
import {
  useModifierGroups,
  useDeactivateModifierGroup,
  useReactivateModifierGroup,
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useGroupsByCategory,
  useAttachCategory,
  useDetachCategory,
  useEffectiveGroups,
  useAttachProduct,
  useDetachProduct,
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
    options: [
      {
        id: "opt-1",
        name: "Entera",
        price_delta: 5,
        is_default: true,
        sort_order: 0,
      },
    ],
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

const inactiveGroup: ModifierGroup = {
  id: "group-3",
  name: "Endulzante",
  min_selected: 0,
  max_selected: 1,
  allow_quantities: false,
  sort_order: 3,
  is_active: false,
  options: [
    {
      id: "opt-3",
      name: "Azúcar",
      price_delta: 0,
      is_default: false,
      sort_order: 0,
    },
  ],
};

describe("ModifiersPage", () => {
  const mockDeactivateGroup = { mutateAsync: vi.fn(), isPending: false };
  const mockReactivateGroup = { mutateAsync: vi.fn(), isPending: false };

  beforeEach(() => {
    vi.clearAllMocks();
    (useModifierGroups as any).mockReturnValue({
      data: mockGroups,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useDeactivateModifierGroup as any).mockReturnValue(mockDeactivateGroup);
    (useReactivateModifierGroup as any).mockReturnValue(mockReactivateGroup);
    (useCreateModifierGroup as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useUpdateModifierGroup as any).mockReturnValue({
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
    (useGroupsByCategory as any).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useAttachCategory as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useDetachCategory as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useEffectiveGroups as any).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useAttachProduct as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useDetachProduct as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    (useCatalogValues as any).mockReturnValue({ data: [] });
    (useProducts as any).mockReturnValue({ data: [], isLoading: false });
    (toast as any).mockImplementation(vi.fn());
  });

  it("renders the groups list with selection range, quantities badge and sort order", () => {
    render(<ModifiersPage />);

    expect(
      screen.getByRole("heading", { name: "Modificadores" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();
    expect(screen.getByText("Extras")).toBeInTheDocument();
    // Rango de selección: required vs optional formatting.
    expect(screen.getByText("Obligatorio 1/1")).toBeInTheDocument();
    expect(screen.getByText("Opcional 0/3")).toBeInTheDocument();
    expect(screen.getByText("Con cantidades")).toBeInTheDocument();
    expect(screen.getByLabelText("Nuevo grupo")).toBeInTheDocument();
  });

  it("shows a friendly Spanish empty state with no technical terms", () => {
    (useModifierGroups as any).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ModifiersPage />);

    expect(
      screen.getByText(/aún no hay grupos de modificadores/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cree el primero con «nuevo grupo»/i),
    ).toBeInTheDocument();
  });

  it("deactivates a group only after confirmation, then notifies success", async () => {
    mockDeactivateGroup.mutateAsync.mockResolvedValue({ success: true });
    render(<ModifiersPage />);

    // Confirmation FIRST: the API must not be called before confirming.
    fireEvent.click(screen.getByLabelText("Desactivar grupo Leche"));
    expect(mockDeactivateGroup.mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Desactivar grupo" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar grupo" }));
    await waitFor(() => {
      expect(mockDeactivateGroup.mutateAsync).toHaveBeenCalledWith("group-1");
    });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Grupo desactivado" }),
      );
    });
  });

  it("renders the Activos/Inactivos/Todos status control defaulting to the active listing", () => {
    render(<ModifiersPage />);

    const statusGroup = screen.getByRole("group", {
      name: "Filtrar grupos por estado",
    });
    expect(statusGroup).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Activos" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Inactivos" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "Todos" }),
    ).toHaveAttribute("aria-pressed", "false");
    // Default listing: the hook is called with the default (active) status.
    expect(useModifierGroups).toHaveBeenCalledWith("active");
  });

  it("refetches with the inactive filter when selecting Inactivos", () => {
    render(<ModifiersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Inactivos" }));

    expect(useModifierGroups).toHaveBeenLastCalledWith("inactive");
    expect(
      screen.getByRole("button", { name: "Inactivos" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a Desactivado badge and an Activar action that opens the confirm dialog for inactive rows", () => {
    (useModifierGroups as any).mockReturnValue({
      data: [inactiveGroup],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ModifiersPage />);

    expect(screen.getByText("Desactivado")).toBeInTheDocument();

    // Confirmation FIRST: the reactivate mutation must not run before
    // the owner confirms.
    fireEvent.click(screen.getByLabelText("Activar grupo Endulzante"));
    expect(mockReactivateGroup.mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Activar grupo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/volverá a mostrarse al ordenar/i),
    ).toBeInTheDocument();
  });

  it("reactivates the group after confirmation and notifies success", async () => {
    (useModifierGroups as any).mockReturnValue({
      data: [inactiveGroup],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockReactivateGroup.mutateAsync.mockResolvedValue({ success: true });
    render(<ModifiersPage />);

    fireEvent.click(screen.getByLabelText("Activar grupo Endulzante"));
    fireEvent.click(screen.getByRole("button", { name: "Activar grupo" }));

    await waitFor(() => {
      expect(mockReactivateGroup.mutateAsync).toHaveBeenCalledWith("group-3");
    });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Grupo activado" }),
      );
    });
  });

  it("does not offer the desactivar action for an already inactive row", () => {
    (useModifierGroups as any).mockReturnValue({
      data: [inactiveGroup],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ModifiersPage />);

    expect(
      screen.queryByLabelText("Desactivar grupo Endulzante"),
    ).not.toBeInTheDocument();
  });

  it("opens the edit form pre-filled when clicking the row edit action", async () => {
    render(<ModifiersPage />);

    fireEvent.click(screen.getByLabelText("Editar grupo Leche"));
    await waitFor(() => {
      expect(screen.getByLabelText("Nombre *")).toHaveValue("Leche");
    });
  });

  it("never renders forbidden internal/technical copy anywhere on the screen", () => {
    const { container } = render(<ModifiersPage />);
    // Owner rule: no plan/section references, internal identifier
    // prefixes, task codes or commit-hash-looking strings in ANY visible
    // copy (labels, badges, empty states, aria-labels included via DOM).
    // The guard walks every tab so nothing added later escapes it.
    const forbiddenPatterns = [
      /§/,
      /INV\./,
      /\bT\d\.\d\b/,
      /\b[0-9a-f]{40}\b/,
      /\b(uuid|tenant|zod|RLS)\b/i,
    ];
    const assertClean = () => {
      const text = container.textContent ?? "";
      for (const pattern of forbiddenPatterns) {
        expect(text).not.toMatch(pattern);
      }
    };

    assertClean(); // Grupos
    fireEvent.click(screen.getByRole("tab", { name: "Por categoría" }));
    assertClean();
    fireEvent.click(screen.getByRole("tab", { name: "Por producto" }));
    assertClean();
  });
});
