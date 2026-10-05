import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModifiersPage } from "./modifiers-page";
import { type ModifierGroup } from "./types";
import {
  useModifierGroups,
  useDeactivateModifierGroup,
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
} from "./use-modifiers";
import { toast } from "@/hooks/use-toast";

vi.mock("./use-modifiers");
vi.mock("@/hooks/use-toast");
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

describe("ModifiersPage", () => {
  const mockDeactivateGroup = { mutateAsync: vi.fn(), isPending: false };

  beforeEach(() => {
    vi.clearAllMocks();
    (useModifierGroups as any).mockReturnValue({
      data: mockGroups,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useDeactivateModifierGroup as any).mockReturnValue(mockDeactivateGroup);
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

  it("opens the edit form pre-filled when clicking the row edit action", async () => {
    render(<ModifiersPage />);

    fireEvent.click(screen.getByLabelText("Editar grupo Leche"));
    await waitFor(() => {
      expect(screen.getByLabelText("Nombre *")).toHaveValue("Leche");
    });
  });

  it("never renders forbidden internal/technical copy anywhere on the screen", () => {
    const { container } = render(<ModifiersPage />);
    const text = container.textContent ?? "";

    // Owner rule: no plan/section references, internal identifier
    // prefixes, task codes or commit-hash-looking strings in ANY visible
    // copy (labels, badges, empty states, aria-labels included via DOM).
    expect(text).not.toMatch(/§/);
    expect(text).not.toMatch(/INV\./);
    expect(text).not.toMatch(/\bT\d\.\d\b/);
    expect(text).not.toMatch(/\b[0-9a-f]{40}\b/);
    expect(text).not.toMatch(/\b(uuid|tenant|zod|RLS)\b/i);
  });
});
