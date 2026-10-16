/**
 * R8 (H8): the per-dish cost/margin surface. The fetch layer is mocked while
 * the real hook and page render under a real QueryClient, so the test proves
 * what the owner actually sees: the cost, the price, the margin and — when a
 * dish cannot be priced — its REASON, never a silent gap.
 *
 * R16 (S13) adds the Nhilos backoffice experience standard as a verifiable
 * rule on the same surface: the gap block is an ATTENTION block (§7.4, §26.1),
 * its copy is operator Spanish without raw ids (§39.4, §30.3, AP-10), the
 * table can be found in and narrowed (§12.1, §13), the active sort and the
 * paging are visible (§15), and the empty states distinguish no-data from
 * no-results (§13.2, §29).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DishMarginsPage } from "@/features/inventory/dish-margins-page";
import {
  fetchDishMargins,
  type DishMargin,
  type DishMarginsResult,
} from "@/features/inventory/dish-margins";

vi.mock("@/lib/tenant", () => ({ useTenantId: () => "tenant-1" }));

vi.mock("@/features/inventory/dish-margins", () => ({
  fetchDishMargins: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDishMargins);

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DishMarginsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(value);

function dish(overrides: Partial<DishMargin> & { productId: string; productName: string }): DishMargin {
  return {
    recipeVersionId: "rv-1",
    yieldQuantity: 1,
    sellingPriceNio: 120,
    unitTheoreticalCostNio: 100,
    grossMarginNio: 20,
    grossMarginPct: 16.6667,
    components: [],
    ...overrides,
  };
}

const emptyResult: DishMarginsResult = { dishes: [], skipped: [] };

describe("DishMarginsPage (R8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue(emptyResult);
  });

  it("shows the unit cost, price and gross margin per dish", async () => {
    mockedFetch.mockResolvedValue({
      dishes: [
        dish({
          productId: "prod-1",
          productName: "ZZ TEST Pan de Lote",
          components: [
            {
              ingredientId: "ins-1",
              ingredientName: "Queso",
              ingredientType: "INSUMO",
              grossQuantity: 1,
              technicalShrinkPct: 0,
              unitCostNio: 100,
              totalCostNio: 100,
              costPercentage: 100,
            },
          ],
        }),
      ],
      skipped: [],
    });

    renderPage();

    expect(await screen.findByText("ZZ TEST Pan de Lote")).toBeInTheDocument();
    expect(screen.getByText("16.67%")).toBeInTheDocument();
    expect(screen.getByText(money(100))).toBeInTheDocument();
  });

  it("lists a dish it could not price WITH its reason, and never a raw id", async () => {
    mockedFetch.mockResolvedValue({
      dishes: [],
      skipped: [
        {
          productId: "21beade5-dfc6-44df-b680-1065b42fc68b",
          productName: "E2E Producto 1792102512976",
          reasonCode: "NO_ACTIVE_RECIPE",
          reason:
            "No tiene una receta publicada vigente. Cree y publique la receta para ver su costo y margen.",
        },
      ],
    });

    renderPage();

    const attention = await screen.findByRole("alert");
    expect(within(attention).getByText("E2E Producto 1792102512976")).toBeInTheDocument();
    expect(
      within(attention).getByText(/receta publicada vigente/),
    ).toBeInTheDocument();
    // §30.3: the id is payload, never operator copy.
    expect(
      screen.queryByText(/21beade5-dfc6-44df-b680-1065b42fc68b/),
    ).toBeNull();
    expect(screen.queryByText(/does not have an active published recipe/)).toBeNull();
  });

  it("names the sub-recipe or ingredient the backend pointed at", async () => {
    mockedFetch.mockResolvedValue({
      dishes: [],
      skipped: [
        {
          productId: "prod-1",
          productName: "Nacatamal",
          reasonCode: "MISSING_COMPONENT",
          reason:
            'El ingrediente “Queso Viejo” ya no existe en el catálogo de insumos.',
        },
      ],
    });

    renderPage();

    expect(await screen.findByText(/Queso Viejo/)).toBeInTheDocument();
  });

  it("is quiet when everything is priced: no attention block", async () => {
    mockedFetch.mockResolvedValue({
      dishes: [dish({ productId: "prod-1", productName: "Cappuccino" })],
      skipped: [],
    });

    renderPage();

    await screen.findByText("Cappuccino");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("searches by dish and by ingredient, and says so when nothing matches", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue({
      dishes: [
        dish({
          productId: "prod-1",
          productName: "Cappuccino",
          components: [
            {
              ingredientId: "ins-1",
              ingredientName: "Leche Entera",
              ingredientType: "INSUMO",
              grossQuantity: 0.2,
              technicalShrinkPct: 0,
              unitCostNio: 38,
              totalCostNio: 7.6,
              costPercentage: 50,
            },
          ],
        }),
        dish({ productId: "prod-2", productName: "Quesillo" }),
      ],
      skipped: [],
    });

    renderPage();
    await screen.findByText("Cappuccino");

    const search = screen.getByRole("textbox", { name: /Buscar/ });
    await user.type(search, "leche");

    // §13: the search reflects how the operator knows the object — by dish OR
    // by the ingredient that carries the cost.
    expect(await screen.findByText("Cappuccino")).toBeInTheDocument();
    expect(screen.queryByText("Quesillo")).toBeNull();

    await user.clear(search);
    await user.type(search, "noexiste");

    // §13.2: no-results names the query and the clear action stays on the
    // search field itself, visible while the query is there.
    expect(await screen.findByText(/noexiste/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Limpiar búsqueda/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cappuccino")).toBeNull();
  });

  it("sorts by an explicit, visible column", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue({
      dishes: [
        dish({ productId: "prod-a", productName: "Barato", unitTheoreticalCostNio: 10, grossMarginNio: 5, grossMarginPct: 33 }),
        dish({ productId: "prod-b", productName: "Caro", unitTheoreticalCostNio: 90, grossMarginNio: 30, grossMarginPct: 25 }),
      ],
      skipped: [],
    });

    renderPage();
    await screen.findByText("Barato");

    const costHeader = screen.getByRole("columnheader", { name: /Costo/ });
    const costButton = within(costHeader).getByRole("button", { name: /Costo/ });
    // §15: the default sort is visible.
    expect(costHeader).toHaveAttribute("aria-sort", "ascending");

    const rows = () =>
      Array.from(
        screen
          .getByRole("table")
          .querySelectorAll("tbody tr td:first-child"),
      ).map((td) => td.textContent);

    expect(rows()).toEqual(["Barato", "Caro"]);

    await user.click(costButton);
    expect(costHeader).toHaveAttribute("aria-sort", "descending");
    expect(rows()).toEqual(["Caro", "Barato"]);
  });

  it("pages a long list and shows the range", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue({
      dishes: Array.from({ length: 12 }, (_, i) =>
        dish({
          productId: `prod-${i}`,
          productName: `Plato ${String(i).padStart(2, "0")}`,
        }),
      ),
      skipped: [],
    });

    renderPage();
    await screen.findByText("Plato 00");

    expect(screen.getByText(/Mostrando 1–10 de 12/)).toBeInTheDocument();
    expect(screen.queryByText("Plato 11")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(await screen.findByText("Plato 11")).toBeInTheDocument();
    expect(screen.getByText(/Mostrando 11–12 de 12/)).toBeInTheDocument();
  });

  it("explains a genuinely empty catalog and points at the next step", async () => {
    mockedFetch.mockResolvedValue({
      dishes: [],
      skipped: [
        {
          productId: "prod-1",
          productName: "Desayuno Típico",
          reasonCode: "NO_ACTIVE_RECIPE",
          reason: "No tiene una receta publicada vigente.",
        },
      ],
    });

    renderPage();

    // §29/§39.4: no implementation vocabulary (COMPOUND/PREPARED) in the copy,
    // and the exception block is the answer, not an empty table.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/COMPOUND|PREPARED/)).toBeNull();
    expect(screen.getByRole("link", { name: /Ir a Recetas/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/recipes"),
    );
  });
});
