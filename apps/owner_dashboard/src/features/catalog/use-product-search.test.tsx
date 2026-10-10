/**
 * useProductSearch (§17.6 slice S3) — the dashboard's single product-search
 * query surface. Pins the contract no form may rebuild:
 *   - endpoint GET /products?search= via fetchPaginatedProducts, page 1;
 *   - the operator's term travels trimmed, or is omitted entirely when empty;
 *   - a page size the selector can render (backend caps at 100);
 *   - deterministic ordering (name ASC) and the active-only default;
 *   - tenant scoping comes from useTenantId, never from caller input;
 *   - useProductById feeds the edit-mode label and never fires without an id.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useProductSearch,
  useProductById,
  PRODUCT_SEARCH_PAGE_SIZE,
} from "./use-product-search";
import { fetchPaginatedProducts, fetchProduct } from "./product-api";

vi.mock("./product-api", () => ({
  fetchPaginatedProducts: vi.fn(),
  fetchProduct: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  useTenantId: () => "tenant-A",
}));

const mockPaginated = fetchPaginatedProducts as ReturnType<typeof vi.fn>;
const mockFetchProduct = fetchProduct as ReturnType<typeof vi.fn>;

function withClient(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function SearchProbe({ search, limit }: { search: string; limit?: number }) {
  const { data, isLoading } = useProductSearch(search, { limit });
  return (
    <div>
      <span>{isLoading ? "loading" : "idle"}</span>
      <span data-testid="probe-rows">
        {JSON.stringify((data?.data ?? []).map((p) => p.id))}
      </span>
      <span data-testid="probe-total">{data?.total ?? "none"}</span>
    </div>
  );
}

describe("useProductSearch — the one place the ?search= contract lives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaginated.mockResolvedValue({
      data: [{ id: "p1", name: "Café de Olla" }],
      total: 1,
      page: 1,
      pageSize: PRODUCT_SEARCH_PAGE_SIZE,
      totalPages: 1,
    });
  });

  it("searches page 1 of /products with the trimmed term and a bounded page size", async () => {
    withClient(<SearchProbe search="  café  " />);
    await waitFor(() => {
      expect(mockPaginated).toHaveBeenCalled();
    });
    expect(mockPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: PRODUCT_SEARCH_PAGE_SIZE,
        search: "café",
        sortBy: "name",
        sortOrder: "ASC",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("probe-total")).toHaveTextContent("1");
    });
  });

  it("an empty term omits the search param: the unfiltered browse list, not a wildcard", async () => {
    withClient(<SearchProbe search="   " />);
    await waitFor(() => {
      expect(mockPaginated).toHaveBeenCalled();
    });
    const params = mockPaginated.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.search).toBeUndefined();
  });

  it("respects a custom limit and passes it through as the page size", async () => {
    withClient(<SearchProbe search="cafe" limit={25} />);
    await waitFor(() => {
      expect(mockPaginated).toHaveBeenCalled();
    });
    expect(mockPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25 }),
      expect.anything(),
    );
  });

  it("scopes every query by the active tenant, from the tenant hook — never caller input", async () => {
    // Observable via the real cache: the tenant sits in the query key so two
    // tenants never share a cached result. The tenant never travels as a URL
    // parameter — the api client and the backend's RLS interceptor derive it
    // from the session.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SearchProbe search="cafe" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(mockPaginated).toHaveBeenCalled();
    });
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key[0]).toBe("products");
      expect(key[1]).toBe("tenant-A");
    }
  });
});

describe("useProductById — edit-mode label source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchProduct.mockResolvedValue({
      id: "p1",
      name: "Café de Olla",
    });
  });

  function IdProbe({ id }: { id: string | undefined }) {
    const { data } = useProductById(id);
    return <span data-testid="probe-name">{data?.name ?? "none"}</span>;
  }

  it("fetches the stored product so the operator sees its human label", async () => {
    withClient(<IdProbe id="p1" />);
    await waitFor(() => {
      expect(mockFetchProduct).toHaveBeenCalledWith(
        "p1",
        expect.anything(),
      );
      expect(screen.getByTestId("probe-name")).toHaveTextContent(
        "Café de Olla",
      );
    });
  });

  it("never fires without an id", () => {
    withClient(<IdProbe id={undefined} />);
    expect(mockFetchProduct).not.toHaveBeenCalled();
    expect(screen.getByTestId("probe-name")).toHaveTextContent("none");
  });
});
