import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ModifierGroupForm } from "./modifier-group-form";
import { useInsumos } from "@/features/recipes/use-recipes";
import {
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useReactivateModifierOption,
} from "./use-modifiers";
import type { ModifierGroup } from "./types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Insumo } from "@/features/recipes/types";

vi.mock("./use-modifiers");
vi.mock("@/hooks/use-toast");
vi.mock("@/features/recipes/use-recipes", () => ({
  useInsumos: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

/**
 * R28 — the operator declares the inventory effect of a modifier option.
 *
 * The effect is edited in its own dialog (the option row is a compact grid)
 * and the declared effect travels with the option's payload. The governed
 * insumo references are SELECTORS with a flexible textual search (§17.5,
 * §17.6): the insumo is a foreign key, so the operator never transcribes
 * an identifier.
 */
const MOCK_INSUMOS: Insumo[] = [
  {
    id: "ins-cafe",
    tenant_id: "t1",
    name: "Café en grano",
    purchaseUom: "KG",
    consumptionUom: "G",
    stock: 5000,
    averageCost: 350,
    is_active: true,
  },
  {
    id: "ins-leche",
    tenant_id: "t1",
    name: "Leche entera",
    purchaseUom: "L",
    consumptionUom: "ML",
    stock: 20,
    averageCost: 40,
    is_active: true,
  },
  {
    id: "ins-almendras",
    tenant_id: "t1",
    name: "Leche de almendras",
    purchaseUom: "L",
    consumptionUom: "ML",
    stock: 8,
    averageCost: 90,
    is_active: true,
  },
];

const mockGroup: ModifierGroup = {
  id: "group-1",
  name: "Leche",
  min_selected: 0,
  max_selected: 3,
  allow_quantities: true,
  sort_order: 2,
  is_active: true,
  options: [
    {
      id: "opt-1",
      name: "Entera",
      price_delta: 5,
      is_default: true,
      sort_order: 0,
      inventory_effect: "NONE",
      effect_insumo_id: null,
      effect_target_insumo_id: null,
      effect_quantity: null,
      effect_factor: null,
    },
  ],
};

const renderForm = (initialData?: ModifierGroup | null) => {
  const onSuccess = vi.fn();
  render(
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupo de modificadores</DialogTitle>
        </DialogHeader>
        <ModifierGroupForm
          initialData={initialData}
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      </DialogContent>
    </Dialog>,
  );
  return { onSuccess };
};

const mockCreateOption = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateOption = { mutateAsync: vi.fn(), isPending: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreateModifierGroup).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "group-1" }),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateModifierGroup>);
  vi.mocked(useUpdateModifierGroup).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "group-1" }),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateModifierGroup>);
  vi.mocked(useCreateModifierOption).mockReturnValue(
    mockCreateOption as unknown as ReturnType<typeof useCreateModifierOption>,
  );
  vi.mocked(useUpdateModifierOption).mockReturnValue(
    mockUpdateOption as unknown as ReturnType<typeof useUpdateModifierOption>,
  );
  vi.mocked(useDeactivateModifierOption).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeactivateModifierOption>);
  vi.mocked(useReactivateModifierOption).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useReactivateModifierOption>);
  vi.mocked(useInsumos).mockReturnValue({
    data: MOCK_INSUMOS,
    isLoading: false,
  } as unknown as ReturnType<typeof useInsumos>);
});

describe("the inventory effect of a modifier option (R28)", () => {
  it("shows the price-only badge on an option that declares no effect", () => {
    renderForm(mockGroup);
    const badges = screen.getAllByTestId(/option-effect-badge-/);
    expect(badges[0]).toHaveTextContent("Solo precio");
  });

  it("opens the effect editor and offers the five effects", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );

    expect(
      await screen.findByTestId("modifier-effect-select"),
    ).toBeInTheDocument();
    // A price-only effect declares no insumo at all: no selector, nothing to
    // fill in.
    expect(
      document.getElementById("modifier-effect-insumo"),
    ).toBeNull();

    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    for (const label of [
      /Solo precio/,
      /Aporta un insumo/,
      /Quita un componente/,
      /Reemplaza un componente/,
      /Multiplica un componente/,
    ]) {
      expect(await screen.findByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("shows the governed insumo search once the effect needs an insumo", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");
    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    fireEvent.click(
      await screen.findByRole("option", { name: /Aporta un insumo/ }),
    );

    // The insumo is a foreign key: it is SEARCHED with a flexible textual
    // search, never typed as an identifier (§17.5, §17.6).
    const search = document.getElementById("modifier-effect-insumo");
    expect(search).not.toBeNull();
    expect(search).toHaveAttribute("role", "combobox");
  });

  it("refuses to save an effect that is missing its insumo, with a Spanish message", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");

    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    fireEvent.click(await screen.findByRole("option", { name: /Aporta un insumo/ }));
    fireEvent.click(screen.getByTestId("modifier-effect-save"));

    expect(await screen.findByTestId("modifier-effect-error")).toHaveTextContent(
      /insumo que aporta/i,
    );
  });

  it("saves a SWAP effect and ships it in the option payload", async () => {
    mockUpdateOption.mutateAsync.mockResolvedValue({ id: "opt-1" });
    renderForm(mockGroup);

    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");
    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    fireEvent.click(
      await screen.findByRole("option", { name: /Reemplaza un componente/ }),
    );

    // The replaced component: whole milk. Each listbox is scoped by its
    // own label, so the two selectors never mix their results.
    const targetList = screen.getByRole("listbox", {
      name: /componente de la receta que reemplaza/i,
    });
    const targetSearch = document.getElementById("modifier-effect-target");
    expect(targetSearch).not.toBeNull();
    fireEvent.change(targetSearch!, { target: { value: "entera" } });
    fireEvent.click(
      await within(targetList).findByRole("option", { name: /Leche entera/ }),
    );

    // The substitute: almond milk.
    const insumoList = screen.getByRole("listbox", {
      name: /insumo que entra en su lugar/i,
    });
    const insumoSearch = document.getElementById("modifier-effect-insumo");
    expect(insumoSearch).not.toBeNull();
    fireEvent.change(insumoSearch!, { target: { value: "almendras" } });
    fireEvent.click(
      await within(insumoList).findByRole("option", {
        name: /Leche de almendras/,
      }),
    );

    fireEvent.click(screen.getByTestId("modifier-effect-save"));

    // The effect is held in the option row; the group's save ships it.
    fireEvent.click(screen.getByRole("button", { name: /^Actualizar$/ }));

    await waitFor(() => {
      expect(mockUpdateOption.mutateAsync).toHaveBeenCalled();
    });
    const call = mockUpdateOption.mutateAsync.mock.calls.at(-1)?.[0] as {
      input: Record<string, unknown>;
    };
    expect(call.input.inventory_effect).toBe("SWAP");
    expect(call.input.effect_target_insumo_id).toBe("ins-leche");
    expect(call.input.effect_insumo_id).toBe("ins-almendras");
    // No explicit quantity: the resolution INHERITS the recipe's own.
    expect(call.input.effect_quantity).toBeNull();
  });

  it("§20 — asks before discarding the edits of the effect", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");
    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    fireEvent.click(
      await screen.findByRole("option", { name: /Aporta un insumo/ }),
    );

    // The operator changed something and tries to leave.
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/ }));

    // The dialog is still open and the discard is ASKED for, not done.
    expect(
      await screen.findByTestId("modifier-effect-discard-confirm"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("modifier-effect-select")).toBeInTheDocument();
  });

  it("§20 — a close without changes does not ask anything", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");

    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    expect(
      screen.queryByTestId("modifier-effect-discard-confirm"),
    ).not.toBeInTheDocument();
  });

  it("§26.1 — the note carries a semantic variant, not the neutral default", async () => {
    renderForm(mockGroup);
    fireEvent.click(
      screen.getByRole("button", { name: /efecto de inventario de la opción/i }),
    );
    await screen.findByTestId("modifier-effect-select");
    fireEvent.click(screen.getByTestId("modifier-effect-select"));
    fireEvent.click(
      await screen.findByRole("option", { name: /Aporta un insumo/ }),
    );

    const note = screen
      .getByText(/no está registrado en esta empresa/i)
      .closest('[role="alert"]');
    // The neutral default would leave the alert indistinguishable from any
    // other box; the info variant gives it a tint and a border.
    expect(note?.className).toContain("bg-info-50");
  });

  it("sends NONE for an option that declares no effect", async () => {
    mockUpdateOption.mutateAsync.mockResolvedValue({ id: "opt-1" });
    renderForm(mockGroup);

    fireEvent.click(screen.getByRole("button", { name: /^Actualizar$/ }));
    await waitFor(() => {
      expect(mockUpdateOption.mutateAsync).toHaveBeenCalled();
    });
    const call = mockUpdateOption.mutateAsync.mock.calls.at(-1)?.[0] as {
      input: Record<string, unknown>;
    };
    expect(call.input.inventory_effect).toBe("NONE");
    expect(call.input.effect_insumo_id).toBeNull();
    expect(call.input.effect_target_insumo_id).toBeNull();
  });
});
