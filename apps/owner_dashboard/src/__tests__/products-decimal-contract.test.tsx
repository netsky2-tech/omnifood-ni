import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPage } from "@/features/catalog/product-page";
import { ErrorBoundary } from "@/app/error-boundary";
import * as apiModule from "@/lib/api";

/**
 * Regression test for the reported production crash:
 * `TypeError: e.sellPrice.toFixed is not a function` on the Products page.
 *
 * The wire payload carries Postgres `numeric` decimals as STRINGS. This test
 * exercises the real path — real fetch boundary, real hooks, real ProductPage,
 * real ErrorBoundary — no mocked hooks.
 */

const RAW_PRODUCTS_WIRE = {
  data: [
    {
      id: "p1",
      tenant_id: "t1",
      name: "Café Artesanal",
      uom: "un",
      product_type: "SIMPLE",
      category_code: null,
      warehouse_id: null,
      is_perishable: false,
      stock: "0.0000",
      averageCost: "12.50",
      sellPrice: "45.00",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

function mockFetchByRoute(): void {
  vi.mocked(globalThis.fetch).mockImplementation(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/products")) {
      return { ok: true, json: async () => RAW_PRODUCTS_WIRE } as Response;
    }
    // Catalog values and any other secondary query: empty payload.
    return { ok: true, json: async () => [] } as Response;
  });
}

function renderProductsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ErrorBoundary>
        <ProductPage />
      </ErrorBoundary>
    </QueryClientProvider>,
  );
}

describe("Products page decimal contract (real fetch → real ProductPage → real ErrorBoundary)", () => {
  const originalFetch = globalThis.fetch;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    apiModule.clearTokens();
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    globalThis.fetch = vi.fn();
    // React logs caught errors through console.error; silence the harness
    // noise without weakening the fallback-text assertion below.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it("renders the string-decimal price instead of crashing into the ErrorBoundary", async () => {
    mockFetchByRoute();

    renderProductsPage();

    await waitFor(() => {
      expect(screen.getByText("C$45.00")).toBeInTheDocument();
    });

    expect(screen.getByText("Café Artesanal")).toBeInTheDocument();
    expect(
      screen.queryByText("Error al cargar esta sección"),
    ).not.toBeInTheDocument();
  });
});
