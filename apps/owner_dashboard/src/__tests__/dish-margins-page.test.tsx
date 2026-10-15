/**
 * R8 (H8): the per-dish cost/margin surface. The fetch layer is mocked while
 * the real hook and page render under a real QueryClient, so the test proves
 * what the owner actually sees: the cost, the price, the margin and — when a
 * dish cannot be priced — its REASON, never a silent gap.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DishMarginsPage } from "@/features/inventory/dish-margins-page";
import { fetchDishMargins } from "@/features/inventory/dish-margins";

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

describe("DishMarginsPage (R8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unit cost, price and gross margin per dish', async () => {
    mockedFetch.mockResolvedValue({
      dishes: [
        {
          productId: "prod-1",
          productName: "ZZ TEST Pan de Lote",
          recipeVersionId: "rv-1",
          yieldQuantity: 1,
          sellingPriceNio: 120,
          unitTheoreticalCostNio: 100,
          grossMarginNio: 20,
          grossMarginPct: 16.6667,
          components: [],
        },
      ],
      skipped: [],
    });

    renderPage();

    const money = (value: number) =>
      new Intl.NumberFormat("es-NI", {
        style: "currency",
        currency: "NIO",
        minimumFractionDigits: 2,
      }).format(value);

    expect(await screen.findByText("ZZ TEST Pan de Lote")).toBeInTheDocument();
    expect(screen.getByText("16.67%")).toBeInTheDocument();
    expect(screen.getByText(money(100))).toBeInTheDocument();
  });

  it('lists a dish it could not price WITH its reason', async () => {
    mockedFetch.mockResolvedValue({
      dishes: [],
      skipped: [
        {
          productId: "prod-bad",
          productName: "Hamburguesa",
          reason: "Insumo 6e80db28 not found for tenant t1",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("No valuados")).toBeInTheDocument();
    expect(screen.getByText("Hamburguesa")).toBeInTheDocument();
    expect(
      screen.getByText(/Insumo 6e80db28 not found/),
    ).toBeInTheDocument();
  });
});
