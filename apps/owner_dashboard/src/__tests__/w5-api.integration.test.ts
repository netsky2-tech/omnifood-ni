import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "@/lib/api";
import {
  fetchCatalogValues,
  createCatalogValue,
  updateCatalogValue,
  deactivateCatalogValue,
  seedCatalogDefaults,
} from "@/features/catalog/catalog-api";

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
