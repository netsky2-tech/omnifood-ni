/**
 * Insumos management tab — Dashboard CRUD evidence (SOHO go-live readiness).
 *
 * The owner must be able to create and maintain materia prima (insumos) from
 * the web dashboard, not only from the POS: search (with reset), stats, empty
 * state, dirty-state protection and the create/edit dialog follow the NHILOS
 * backoffice experience standard (audit AT-02, AT-03, AT-09 and BX-017/018/020).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsumosTab } from "@/features/inventory/insumos-tab";
import {
  useCreateInsumo,
  useUpdateInsumo,
} from "@/features/recipes/use-recipes";
import {
  useCatalogValues,
  useSeedCatalogDefaults,
} from "@/features/catalog/use-catalog";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { Insumo } from "@/features/recipes/types";
import type { CatalogValue } from "@/features/catalog/types";

vi.mock("@/features/recipes/use-recipes", () => ({
  useCreateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateInsumo: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/features/catalog/use-catalog", () => ({
  useCatalogValues: vi.fn(() => ({ data: [], isLoading: false })),
  useSeedCatalogDefaults: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Renders the tab and waits for the catalog query to resolve. */
async function renderLoadedTab() {
  render(<InsumosTab />, { wrapper: TestWrapper });
  await screen.findByText("Café en Grano");
}

/** UOM catalog values mirroring the backend seed (codes are lowercase). */
function makeUom(code: string, name: string): CatalogValue {
  return {
    id: `uom-${code}`,
    tenant_id: "t1",
    catalog_type: "UOM",
    code,
    name,
    is_active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const MOCK_UOM_CATALOG: CatalogValue[] = [
  makeUom("kg", "Kilogramo"),
  makeUom("g", "Gramo"),
  makeUom("lb", "Libra"),
  makeUom("l", "Litro"),
  makeUom("ml", "Mililitro"),
  makeUom("un", "Unidad"),
];

const MOCK_INSUMOS: Insumo[] = [
  {
    id: "ins-1",
    tenant_id: "t1",
    name: "Café en Grano",
    purchaseUom: "LB",
    consumptionUom: "G",
    conversionFactor: 454,
    stock: 4540,
    averageCost: 350,
    parLevel: 2000,
    minStock: 500,
    is_perishable: false,
    negativeStockPolicy: "RESTRICT",
    is_active: true,
  },
  {
    id: "ins-2",
    tenant_id: "t1",
    name: "Leche Entera",
    purchaseUom: "L",
    consumptionUom: "ML",
    conversionFactor: 1000,
    stock: 4000,
    averageCost: 55,
    parLevel: 10000,
    minStock: 2000,
    is_perishable: true,
    negativeStockPolicy: "RESTRICT",
    is_active: true,
  },
  {
    id: "ins-3",
    tenant_id: "t1",
    name: "Crema Baja en Grasa",
    purchaseUom: "L",
    consumptionUom: "ML",
    conversionFactor: 1000,
    stock: 0,
    averageCost: 80,
    parLevel: null,
    minStock: null,
    is_perishable: true,
    negativeStockPolicy: "RESTRICT",
    is_active: false,
  },
  {
    id: "ins-4",
    tenant_id: "t1",
    name: "Queso Fresco",
    // Stored unit that no longer exists in the catalog: editing must keep it
    // selectable instead of silently dropping it (§48: never lose data).
    purchaseUom: "DOCENA",
    consumptionUom: "UN",
    conversionFactor: 1,
    stock: 12,
    averageCost: 90,
    parLevel: null,
    minStock: null,
    is_perishable: false,
    negativeStockPolicy: "RESTRICT",
    is_active: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  vi.mocked(api.get).mockResolvedValue(MOCK_INSUMOS);
  vi.mocked(useCatalogValues).mockReturnValue({
    data: MOCK_UOM_CATALOG,
    isLoading: false,
  } as unknown as ReturnType<typeof useCatalogValues>);
  vi.mocked(useSeedCatalogDefaults).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSeedCatalogDefaults>);
  vi.mocked(useCreateInsumo).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateInsumo>);
  vi.mocked(useUpdateInsumo).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInsumo>);
});

/** Opens a UoM catalog select and picks an option by its visible label. */
async function pickUom(
  user: ReturnType<typeof userEvent.setup>,
  testId: string,
  optionName: string | RegExp,
) {
  await user.click(screen.getByTestId(testId));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("InsumosTab", () => {
  it("renders the insumos list with conversion and FIFO properties", async () => {
    await renderLoadedTab();

    expect(screen.getByText("Café en Grano")).toBeInTheDocument();
    expect(screen.getByText("Leche Entera")).toBeInTheDocument();
    // Conversion badge pair: purchase → consumption unit.
    expect(screen.getByText("LB")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
    // Perishable property badge (FIFO control).
    expect(
      within(screen.getByTestId("insumo-row-ins-2")).getByText("Perecedero"),
    ).toBeInTheDocument();
    // Stats reflect the active rows (inactive lifecycle rows are excluded).
    expect(screen.getByText("Total Insumos")).toBeInTheDocument();
  });

  it("shows the Inactivo badge only for genuinely inactive rows (BX-018)", async () => {
    await renderLoadedTab();

    const inactiveRow = screen.getByTestId("insumo-row-ins-3");
    const inactiveBadge = within(inactiveRow).getByText("Inactivo");
    expect(inactiveBadge).toBeInTheDocument();
    // §26/§27: INACTIVE is a neutral lifecycle state — secondary palette,
    // never the destructive/red exception palette.
    expect(inactiveBadge).toHaveClass("bg-muted");
    expect(inactiveBadge).not.toHaveClass("bg-red-50");
    expect(screen.getByTestId("insumo-row-ins-1")).not.toHaveTextContent("Inactivo");
    // Deactivate/reactivate row actions are reachable.
    expect(screen.getByTestId("deactivate-insumo-ins-1")).toBeInTheDocument();
    expect(screen.getByTestId("reactivate-insumo-ins-3")).toBeInTheDocument();
  });

  it("shows an empty state with guidance when no insumos exist", async () => {
    vi.mocked(api.get).mockResolvedValue([]);

    render(<InsumosTab />, { wrapper: TestWrapper });

    expect(
      await screen.findByText(/Comience agregando materia prima/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("add-insumo-btn")).not.toBeDisabled();
  });

  it("filters rows by search term", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.type(screen.getByTestId("insumos-search-input"), "leche");

    await waitFor(() => {
      expect(screen.getByText("Leche Entera")).toBeInTheDocument();
      expect(screen.queryByText("Café en Grano")).not.toBeInTheDocument();
    });
  });

  it("restores the full dataset via the search clear control (AT-09 / BX-001)", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    const input = screen.getByTestId("insumos-search-input");
    await user.type(input, "leche");
    await waitFor(() => {
      expect(screen.queryByText("Café en Grano")).not.toBeInTheDocument();
    });

    // The clear control only exists while a term is applied.
    const clear = screen.getByTestId("insumos-search-clear");
    expect(clear).toHaveAccessibleName("Limpiar búsqueda");
    await user.click(clear);

    await waitFor(() => {
      expect(screen.getByText("Café en Grano")).toBeInTheDocument();
      expect(screen.getByText("Leche Entera")).toBeInTheDocument();
    });
    expect(input).toHaveValue("");
    expect(screen.queryByTestId("insumos-search-clear")).not.toBeInTheDocument();
  });

  it("creates an insumo through the dialog with the required fields", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Azúcar Blanca");
    await pickUom(user, "insumo-form-purchase-uom", "Libra (lb)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");
    await user.clear(screen.getByTestId("insumo-form-conversion-factor"));
    await user.click(screen.getByTestId("insumo-form-conversion-factor"));
    await user.keyboard("{Control>}a{/Control}454");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Azúcar Blanca",
          purchaseUom: "LB",
          consumptionUom: "G",
          conversionFactor: 454,
        }),
      );
    });
  });

  it("populates the UoM selects from the shared catalog with a placeholder", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));

    // §17.3/§40: no pre-filled default — the selects start on a placeholder.
    expect(screen.getByTestId("insumo-form-purchase-uom")).toHaveTextContent(
      "Selecciona la unidad",
    );
    expect(screen.getByTestId("insumo-form-consumption-uom")).toHaveTextContent(
      "Selecciona la unidad",
    );

    await user.click(screen.getByTestId("insumo-form-purchase-uom"));
    const listbox = await screen.findByRole("listbox");
    for (const label of ["Kilogramo (kg)", "Libra (lb)", "Unidad (un)"]) {
      expect(within(listbox).getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("blocks submission when a UoM is blank, with actionable copy (§17.3/§18.2)", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela");
    await user.click(screen.getByTestId("insumo-form-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /Selecciona la unidad de compra y la unidad de consumo/i,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps a stored UoM missing from the catalog selectable when editing", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("edit-insumo-ins-4"));
    await waitFor(() => {
      expect(screen.getByText(/Editar Insumo/i)).toBeInTheDocument();
    });

    // DOCENA is not in the catalog but stays selectable as a fallback item.
    await user.click(screen.getByTestId("insumo-form-purchase-uom"));
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: "DOCENA" }),
    ).toBeInTheDocument();
    expect(
      within(listbox).getByRole("option", { name: "Libra (lb)" }),
    ).toBeInTheDocument();

    await user.click(within(listbox).getByRole("option", { name: "DOCENA" }));

    // Saving keeps the stored unit untouched.
    await user.click(screen.getByTestId("insumo-form-submit"));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ins-4",
          input: expect.objectContaining({ purchaseUom: "DOCENA" }),
        }),
      );
    });
  });

  it("shows seed guidance and seeds the UOM catalog when it is empty (§29)", async () => {
    vi.mocked(useCatalogValues).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useCatalogValues>);
    const seedMutate = vi.fn();
    vi.mocked(useSeedCatalogDefaults).mockReturnValue({
      mutate: seedMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSeedCatalogDefaults>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));

    // No dead-end disabled selects: guidance + one-click seed action (AP-17).
    expect(screen.getByTestId("insumo-form-uom-empty")).toHaveTextContent(
      /Aún no hay unidades de medida en tu catálogo/i,
    );
    expect(screen.getByTestId("insumo-form-purchase-uom")).toBeDisabled();

    await user.click(screen.getByTestId("insumo-form-seed-uom-btn"));
    expect(seedMutate).toHaveBeenCalledTimes(1);
  });

  it("blocks submission when the name is blank", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(
        screen.getByText(/El nombre del insumo es obligatorio/i),
      ).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("announces and focuses the form-level error banner (AT-03 / BX-005)", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.click(screen.getByTestId("insumo-form-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/El nombre del insumo es obligatorio/i);
    expect(alert).toHaveFocus();
  });

  it("announces an invalid-factor submit exactly once, at field level (R1)", async () => {
    const mutateAsync = vi.fn();
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela");
    await pickUom(user, "insumo-form-purchase-uom", "Kilogramo (kg)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");
    await user.clear(screen.getByTestId("insumo-form-conversion-factor"));
    await user.click(screen.getByTestId("insumo-form-submit"));

    // The factor problem must be announced once — a duplicated form-level
    // role="alert" would make screen readers read it twice.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(FACTOR_COPY);
    // No form-level banner is rendered for this field-level failure.
    expect(screen.queryByTestId("insumo-form-error")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("insumo-form-conversion-factor"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("maps transport failures to actionable Spanish copy (AT-03 / BX-004)", async () => {
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Failed to fetch")),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela");
    await pickUom(user, "insumo-form-purchase-uom", "Kilogramo (kg)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");
    await user.click(screen.getByTestId("insumo-form-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Error de conexión/i);
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    // The dialog stays open with the typed data preserved.
    expect(screen.getByTestId("insumo-form-name")).toHaveValue("Canela");
  });

  it("shows a submit button whose width class is stable while saving (BX-006)", async () => {
    const user = userEvent.setup();
    const view = render(<InsumosTab />, { wrapper: TestWrapper });
    await screen.findByText("Café en Grano");

    await user.click(screen.getByTestId("add-insumo-btn"));

    const submit = screen.getByTestId("insumo-form-submit");
    const idleClass = submit.className;
    expect(idleClass).toContain("min-w-");

    // The pending state comes from the mutation hook; flip it and re-render.
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: true,
    } as unknown as ReturnType<typeof useCreateInsumo>);
    view.rerender(<InsumosTab />);

    const saving = screen.getByTestId("insumo-form-submit");
    expect(saving).toHaveTextContent("Guardando...");
    expect(saving.className).toBe(idleClass);
  });

  it("edits an existing insumo through the dialog", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("edit-insumo-ins-1"));
    await waitFor(() => {
      expect(
        screen.getByText(/Editar Insumo/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("edit-insumo-ins-1")).toHaveAccessibleName(
      "Editar insumo",
    );

    await user.clear(screen.getByTestId("insumo-form-par-level"));
    await user.type(screen.getByTestId("insumo-form-par-level"), "3000");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "ins-1",
        input: expect.objectContaining({
          name: "Café en Grano",
          parLevel: 3000,
        }),
      });
    });
  });

  it("warns before discarding dirty form state on Escape and keeps it on 'Seguir editando' (AT-02 / BX-003)", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela Molida");
    await user.keyboard("{Escape}");

    const confirm = await screen.findByText("¿Descartar los cambios del insumo?");
    expect(confirm).toBeInTheDocument();

    await user.click(screen.getByTestId("insumo-discard-stay-btn"));
    expect(screen.queryByText("¿Descartar los cambios del insumo?")).not.toBeInTheDocument();
    expect(screen.getByTestId("insumo-form-name")).toHaveValue("Canela Molida");
    expect(
      screen.getByText(/Nuevo Insumo de Materia Prima/i),
    ).toBeInTheDocument();
  });

  it("closes silently on Escape when the form is pristine (AT-02 / BX-003)", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("insumo-form-name")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText("¿Descartar los cambios del insumo?"),
    ).not.toBeInTheDocument();
  });

  it("warns through Cancelar with unsaved edits, then discards on confirm", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("¿Descartar los cambios del insumo?")).toBeInTheDocument();
    await user.click(screen.getByTestId("insumo-discard-confirm-btn"));

    await waitFor(() => {
      expect(screen.queryByTestId("insumo-form-name")).not.toBeInTheDocument();
    });
  });

  it("validates the conversion factor on blur without coercing while typing (BX-017)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));

    // A cleared factor stays empty (no silent snap back to 1).
    const factor = screen.getByTestId("insumo-form-conversion-factor");
    await user.clear(factor);
    expect(factor).toHaveValue(null);

    // Blur surfaces the rule instead of waiting for submit.
    await user.tab();
    expect(screen.getByText(FACTOR_COPY)).toBeInTheDocument();

    // A legal sub-1 factor is accepted and parsed at submit time.
    await user.type(factor, "0.5");
    await user.type(screen.getByTestId("insumo-form-name"), "Canela");
    await pickUom(user, "insumo-form-purchase-uom", "Kilogramo (kg)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");
    await user.click(screen.getByTestId("insumo-form-submit"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ conversionFactor: 0.5 }),
      );
    });
  });

  // Conversion-factor presets (founder, 2026-09-30): a fast path alongside
  // the numeric input, derived from the purchase→consumption UoM pair. Per
  // §40, choosing a preset FILLS the input (reversible, user-edited), never
  // silently applies; unknown/blank pairs show a hint instead of a dead-end
  // disabled control (§33.2/AP-17).
  it("offers a conversion preset that fills the factor input when the UoM pair is recognized", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    // No UoM pair yet: hint, not a dead-end disabled control (§33.2/AP-17).
    expect(screen.getByTestId("insumo-form-factor-presets")).toHaveTextContent(
      /Selecciona las unidades para ver factores comunes/i,
    );

    await pickUom(user, "insumo-form-purchase-uom", "Libra (lb)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");

    // The recognized pair surfaces its preset; choosing it FILLS the input
    // (still visible and editable — nothing is applied silently, §40).
    const preset = await screen.findByTestId("insumo-form-factor-preset-lb-g");
    await user.click(preset);
    expect(
      screen.getByTestId("insumo-form-conversion-factor"),
    ).toHaveValue(454);

    // The filled value is an ordinary editable value: submit parses it.
    await user.type(screen.getByTestId("insumo-form-name"), "Queso Mozarella");
    await user.click(screen.getByTestId("insumo-form-submit"));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseUom: "LB",
          consumptionUom: "G",
          conversionFactor: 454,
        }),
      );
    });
  });

  it("shows the preset hint when the UoM pair has no known common factor", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await pickUom(user, "insumo-form-purchase-uom", "Libra (lb)");
    await pickUom(user, "insumo-form-consumption-uom", "Unidad (un)");

    // LB→UN has no justified common factor: hint, never a guessed value.
    expect(screen.getByTestId("insumo-form-factor-presets")).toHaveTextContent(
      /Selecciona las unidades para ver factores comunes/i,
    );
    expect(
      screen.queryByTestId(/^insumo-form-factor-preset-/),
    ).not.toBeInTheDocument();
  });

  it("submits and keeps the dialog open with a reset form via 'Guardar y crear otro' (BX-020)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useCreateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("add-insumo-btn"));
    await user.type(screen.getByTestId("insumo-form-name"), "Canela Molida");
    await pickUom(user, "insumo-form-purchase-uom", "Kilogramo (kg)");
    await pickUom(user, "insumo-form-consumption-uom", "Gramo (g)");
    await user.click(screen.getByTestId("insumo-form-save-another"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Canela Molida" }),
      );
    });
    // Dialog stays open, form reset for the next insumo.
    expect(screen.getByTestId("insumo-form-name")).toHaveValue("");
    expect(
      screen.getByText(/Nuevo Insumo de Materia Prima/i),
    ).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Insumo creado" }),
    );
  });

  it("does not offer 'Guardar y crear otro' while editing", async () => {
    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("edit-insumo-ins-1"));
    await waitFor(() => {
      expect(screen.getByText(/Editar Insumo/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("insumo-form-save-another")).not.toBeInTheDocument();
  });

  it("deactivates an insumo after a proportionate confirmation (BX-018)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("deactivate-insumo-ins-1"));

    // Confirmation names the object, the consequence and the reversibility.
    expect(
      await screen.findByText("¿Desactivar el insumo 'Café en Grano'?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/dejará de estar disponible para recetas y movimientos/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/reactivarlo en cualquier momento/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("insumo-deactivate-confirm-btn"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "ins-1",
        input: { is_active: false },
      });
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Insumo desactivado" }),
    );
  });

  it("reactivates an inactive insumo directly without confirmation (BX-018)", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("reactivate-insumo-ins-3"));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "ins-3",
        input: { is_active: true },
      });
    });
    expect(
      screen.queryByText("¿Desactivar el insumo 'Crema Baja en Grasa'?"),
    ).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Insumo reactivado" }),
    );
  });

  it("surfaces a mapped error when deactivation is rejected (BX-018)", async () => {
    vi.mocked(useUpdateInsumo).mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockRejectedValue(
          new Error("El insumo está referenciado por recetas publicadas"),
        ),
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateInsumo>);

    const user = userEvent.setup();
    await renderLoadedTab();

    await user.click(screen.getByTestId("deactivate-insumo-ins-1"));
    await user.click(screen.getByTestId("insumo-deactivate-confirm-btn"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });
});

const FACTOR_COPY = "El factor de conversión debe ser mayor que 0.";
