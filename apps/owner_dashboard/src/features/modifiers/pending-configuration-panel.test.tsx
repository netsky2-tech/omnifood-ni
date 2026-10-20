import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingConfigurationPanel } from "./pending-configuration-panel";
import {
  useModifierGroups,
  useCreateModifierGroup,
  useUpdateModifierGroup,
  useCreateModifierOption,
  useUpdateModifierOption,
  useDeactivateModifierOption,
  useReactivateModifierOption,
} from "./use-modifiers";
import { useQuery } from "@tanstack/react-query";
import { type ModifierGroup } from "./types";

vi.mock("./use-modifiers");
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

/**
 * The backoffice's half of the owner's decision (2026-10-20): the amount an
 * extra takes out of the stock is CONFIGURATION, so the missing configuration
 * has to be visible in the backoffice — with the product where it bites and
 * the reason, in the owner's words.
 */
const mockGroups: ModifierGroup[] = [
  {
    id: "group-1",
    name: "Extras",
    min_selected: 0,
    max_selected: 3,
    allow_quantities: true,
    sort_order: 0,
    is_active: true,
    options: [
      {
        id: "opt-1",
        name: "Extra shot",
        price_delta: 15,
        is_default: false,
        sort_order: 0,
        inventory_effect: "ADD",
        effect_insumo_id: "ins-cafe",
        effect_target_insumo_id: "ins-cafe",
        effect_quantity: null,
        effect_factor: null,
      },
    ],
  },
];

const PENDING = [
  {
    option_id: "opt-1",
    option_name: "Extra shot",
    group_id: "group-1",
    group_name: "Extras",
    inventory_effect: "ADD",
    effect_insumo_id: "ins-cafe",
    effect_target_insumo_id: "ins-cafe",
    products: [
      {
        product_id: "prod-1",
        product_name: "Capuccino",
        reason: "PRODUCT_WITHOUT_RECIPE",
      },
    ],
  },
];

describe("PendingConfigurationPanel", () => {
  let pending: unknown[] = PENDING;

  beforeEach(() => {
    vi.clearAllMocks();
    pending = PENDING;
    (useModifierGroups as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockGroups,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    // The group's form needs its mutation hooks (the form reads isPending).
    const mutation = () => ({
      isPending: false,
      isError: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
    for (const hook of [
      useCreateModifierGroup,
      useUpdateModifierGroup,
      useCreateModifierOption,
      useUpdateModifierOption,
      useDeactivateModifierOption,
      useReactivateModifierOption,
    ]) {
      (hook as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mutation());
    }
    (useQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (options: { queryKey: string[] }) => ({
        data: options.queryKey.includes("pending-configuration")
          ? pending
          : undefined,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }),
    );
  });

  it("names the option, the product and the reason — in the owner's words", async () => {
    render(<PendingConfigurationPanel />);

    expect(await screen.findByText("Extra shot")).toBeTruthy();
    expect(screen.getByText("Capuccino")).toBeTruthy();
    // The reason is explained, not coded: the resolver's vocabulary does not
    // reach the owner.
    expect(
      screen.getByText(/El producto no tiene receta activa/i),
    ).toBeTruthy();
    expect(screen.queryByText("PRODUCT_WITHOUT_RECIPE")).toBeNull();
  });

  it("says nothing when there is nothing pending", async () => {
    pending = [];

    render(<PendingConfigurationPanel />);

    expect(
      await screen.findByText(/No hay pendientes de configurar/i),
    ).toBeTruthy();
  });

  it("opens the group's form to configure the option's effect", async () => {
    render(<PendingConfigurationPanel />);

    const configure = await screen.findByRole("button", {
      name: /Configurar Extra shot/i,
    });
    fireEvent.click(configure);

    await waitFor(() => {
      expect(screen.getByText(/Configurar el efecto de/i)).toBeTruthy();
    });
  });
});
