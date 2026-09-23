import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "@/lib/api";
import {
  fetchCatalogValues,
  createCatalogValue,
  updateCatalogValue,
  deactivateCatalogValue,
  seedCatalogDefaults,
} from "@/features/catalog/catalog-api";
import {
  fetchProducts,
  fetchPaginatedProducts,
  fetchProduct,
  createProduct,
  updateProduct,
} from "@/features/catalog/product-api";

/** Wire payload exactly as the backend sends it: Postgres `numeric` arrives as strings. */
const RAW_PRODUCT_WIRE = {
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
};

function expectNormalizedProduct(result: unknown): void {
  const product = result as Record<string, unknown>;
  expect(typeof product.sellPrice).toBe("number");
  expect(typeof product.stock).toBe("number");
  expect(typeof product.averageCost).toBe("number");
  expect(product.sellPrice).toBe(45);
  expect(product.stock).toBe(0);
  expect(product.averageCost).toBe(12.5);
  // Every other field must pass through untouched.
  expect(product.id).toBe("p1");
  expect(product.name).toBe("Café Artesanal");
  expect(product.uom).toBe("un");
  expect(product.product_type).toBe("SIMPLE");
  expect(product.category_code).toBeNull();
  expect(product.is_active).toBe(true);
  expect(product.created_at).toBe("2026-01-01T00:00:00Z");
}

describe("W5 — Catalog API integration (fetch-level)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiModule.clearTokens();
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchCatalogValues sends GET with type in URL", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ code: "kg", name: "Kilogramo" }],
    } as Response);

    const result = await fetchCatalogValues("UOM");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-at",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result).toEqual([{ code: "kg", name: "Kilogramo" }]);
  });

  it("fetchCatalogValues appends includeInactive=true when requested", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchCatalogValues("UOM", true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM?includeInactive=true",
      expect.anything(),
    );
  });

  it("fetchCatalogValues does not append query param when includeInactive is false", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchCatalogValues("UOM", false);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM",
      expect.anything(),
    );
  });

  it("createCatalogValue sends POST with body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-1", code: "gal", name: "Galón" }),
    } as Response);

    const result = await createCatalogValue("UOM", {
      code: "gal",
      name: "Galón",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "gal", name: "Galón" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-at",
        }),
      }),
    );
    expect(result).toEqual({ id: "new-1", code: "gal", name: "Galón" });
  });

  it("createCatalogValue sends optional fields when provided", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-2" }),
    } as Response);

    await createCatalogValue("INVENTORY_CATEGORY", {
      code: "LACTEOS",
      name: "Lácteos",
      is_active: false,
      sort_order: 5,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/INVENTORY_CATEGORY",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "LACTEOS",
          name: "Lácteos",
          is_active: false,
          sort_order: 5,
        }),
      }),
    );
  });

  it("updateCatalogValue sends PATCH with id in URL and body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "u1", name: "Kg actualizado" }),
    } as Response);

    const result = await updateCatalogValue("UOM", "u1", {
      name: "Kg actualizado",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM/u1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Kg actualizado" }),
      }),
    );
    expect(result).toEqual({ id: "u1", name: "Kg actualizado" });
  });

  it("updateCatalogValue sends is_active toggle", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "u1", is_active: false }),
    } as Response);

    await updateCatalogValue("UOM", "u1", { is_active: false });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM/u1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
    );
  });

  it("deactivateCatalogValue sends DELETE with id in URL", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "u1", deactivated: true }),
    } as Response);

    const result = await deactivateCatalogValue("UOM", "u1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/UOM/u1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result).toEqual({ id: "u1", deactivated: true });
  });

  it("seedCatalogDefaults sends POST to seed-defaults endpoint", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ inserted: 14 }),
    } as Response);

    const result = await seedCatalogDefaults();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/catalogs/seed-defaults",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(result).toEqual({ inserted: 14 });
  });

  it("throws on non-ok response with error message", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "Catalog value already exists" }),
    } as Response);

    await expect(
      createCatalogValue("UOM", { code: "kg", name: "Kilogramo" }),
    ).rejects.toThrow("Catalog value already exists");
  });

  it("throws generic error when response body has no message", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(
      fetchCatalogValues("UOM"),
    ).rejects.toThrow("API error: 500");
  });

  it("throws on network error", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network offline"));

    await expect(fetchCatalogValues("UOM")).rejects.toThrow("Network offline");
  });

  it("sends tenant-scoped Authorization header on all catalog requests", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchCatalogValues("UOM");
    await createCatalogValue("UOM", { code: "x", name: "X" });
    await updateCatalogValue("UOM", "1", { name: "Y" });
    await deactivateCatalogValue("UOM", "1");

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    for (const call of calls) {
      const headers = (call[1] as RequestInit)?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe("Bearer test-at");
    }
  });
});

describe("W5 — Product API decimal contract (fetch-level)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiModule.clearTokens();
    apiModule.setTokens({ accessToken: "test-at", refreshToken: "test-rt" });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockJsonResponse(body: unknown): void {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);
  }

  it("fetchPaginatedProducts normalizes string decimals to numbers", async () => {
    mockJsonResponse({
      data: [RAW_PRODUCT_WIRE],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });

    const result = await fetchPaginatedProducts({ productType: "SIMPLE" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/products?productType=SIMPLE&page=1&pageSize=25",
      expect.anything(),
    );
    expect(result.data).toHaveLength(1);
    expectNormalizedProduct(result.data[0]);
    expect(typeof result.total).toBe("number");
  });

  it("fetchProducts (plain, non-paginated) normalizes string decimals to numbers", async () => {
    mockJsonResponse([RAW_PRODUCT_WIRE]);

    const result = await fetchProducts({ productType: "SIMPLE" });

    expect(Array.isArray(result)).toBe(true);
    expectNormalizedProduct((result as unknown[])[0]);
  });

  it("fetchProducts (string param) normalizes string decimals to numbers", async () => {
    mockJsonResponse([RAW_PRODUCT_WIRE]);

    const result = await fetchProducts("SIMPLE", true);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/products?productType=SIMPLE&includeInactive=true",
      expect.anything(),
    );
    expect(Array.isArray(result)).toBe(true);
    expectNormalizedProduct((result as unknown[])[0]);
  });

  it("fetchProduct normalizes string decimals to numbers", async () => {
    mockJsonResponse(RAW_PRODUCT_WIRE);

    const result = await fetchProduct("p1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/products/p1",
      expect.anything(),
    );
    expectNormalizedProduct(result);
  });

  it("createProduct normalizes string decimals to numbers", async () => {
    mockJsonResponse(RAW_PRODUCT_WIRE);

    const result = await createProduct({
      name: "Café Artesanal",
      uom: "un",
      product_type: "SIMPLE",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/products",
      expect.objectContaining({ method: "POST" }),
    );
    expectNormalizedProduct(result);
  });

  it("updateProduct normalizes string decimals to numbers", async () => {
    mockJsonResponse({ ...RAW_PRODUCT_WIRE, name: "Café Actualizado" });

    const result = await updateProduct("p1", { name: "Café Actualizado" });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/products/p1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(typeof result.sellPrice).toBe("number");
    expect(typeof result.stock).toBe("number");
    expect(typeof result.averageCost).toBe("number");
    expect(result.sellPrice).toBe(45);
    expect(result.stock).toBe(0);
    expect(result.averageCost).toBe(12.5);
    expect(result.name).toBe("Café Actualizado");
  });
});
