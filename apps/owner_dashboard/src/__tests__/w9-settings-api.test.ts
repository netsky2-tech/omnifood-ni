import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { setTokens, clearTokens } from "@/lib/api";
import {
  fetchFiscalSetup,
  updateFiscalSetup,
  fetchIndustryTemplates,
  applyIndustryTemplate,
  uploadImportBatch,
  commitImport,
  fetchImportErrors,
  uploadLargeDatasetInChunks,
} from "@/features/settings/settings-api";
import {
  FiscalRegime,
  fiscalSetupSchema,
  importRowSchema,
  commitImportSchema,
  MAX_IMPORT_CHUNK_SIZE,
} from "@/features/settings/types";
import type { ImportRowDto } from "@/features/settings/types";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "test-owner-token", refreshToken: "test-refresh-token" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

function mockFetchSuccess(body: unknown, status = 200) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(status: number, message: string) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ message, statusCode: status }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("W9 — Fiscal Setup & Onboarding API & Schemas (TDD RED -> GREEN -> TRIANGULATION)", () => {
  describe("Zod Validation Schemas", () => {
    describe("fiscalSetupSchema", () => {
      it("validates valid CUOTA_FIJA configuration", () => {
        const payload = {
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: "Cafetería La Esquina",
          ruc: "J0310000012345",
          commercialFxSpread: 0.5,
          pricesIncludeTax: false,
          phone: "+505 8888-1234",
          address: "Managua, Nicaragua",
        };
        const parsed = fiscalSetupSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
      });

      it("validates valid REGIMEN_GENERAL configuration", () => {
        const payload = {
          regime: FiscalRegime.REGIMEN_GENERAL,
          businessName: "OmniFood Gourmet S.A.",
          ruc: "J0310000099999",
          commercialFxSpread: 0.75,
          pricesIncludeTax: true,
        };
        const parsed = fiscalSetupSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
      });

      it("rejects empty business name", () => {
        const invalid = {
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: "   ",
          commercialFxSpread: 0.5,
          pricesIncludeTax: false,
        };
        const parsed = fiscalSetupSchema.safeParse(invalid);
        expect(parsed.success).toBe(false);
      });

      it("rejects negative FX spread", () => {
        const invalid = {
          regime: FiscalRegime.REGIMEN_GENERAL,
          businessName: "OmniFood S.A.",
          commercialFxSpread: -0.25,
          pricesIncludeTax: true,
        };
        const parsed = fiscalSetupSchema.safeParse(invalid);
        expect(parsed.success).toBe(false);
      });

      it("rejects invalid regime", () => {
        const invalid = {
          regime: "MONOTRIBUTO",
          businessName: "OmniFood S.A.",
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        };
        const parsed = fiscalSetupSchema.safeParse(invalid);
        expect(parsed.success).toBe(false);
      });
    });

    describe("importRowSchema", () => {
      it("validates a complete valid import row", () => {
        const row: ImportRowDto = {
          nombre: "Café Espresso Doble",
          sku: "CAF-001",
          precioVenta: 65,
          costoInsumo: 22.5,
          categoria: "Bebidas Calientes",
          porcentajeIva: 15,
          uom: "UN",
          stockInicial: 100,
        };
        const parsed = importRowSchema.safeParse(row);
        expect(parsed.success).toBe(true);
      });

      it("validates a minimal valid import row with string price", () => {
        const row = {
          nombre: "Agua Purificada 500ml",
          precioVenta: "25.00",
        };
        const parsed = importRowSchema.safeParse(row);
        expect(parsed.success).toBe(true);
      });

      it("rejects row without nombre", () => {
        const row = {
          sku: "CAF-002",
          precioVenta: 40,
        };
        const parsed = importRowSchema.safeParse(row);
        expect(parsed.success).toBe(false);
      });

      it("rejects row with empty or non-numeric precioVenta", () => {
        const row = {
          nombre: "Producto X",
          precioVenta: "gratis",
        };
        const parsed = importRowSchema.safeParse(row);
        expect(parsed.success).toBe(false);
      });

      it("rejects row with negative precioVenta", () => {
        const row = {
          nombre: "Producto Negativo",
          precioVenta: -10,
        };
        const parsed = importRowSchema.safeParse(row);
        expect(parsed.success).toBe(false);
      });
    });

    describe("commitImportSchema", () => {
      it("validates valid commit payload", () => {
        const payload = {
          sessionToken: "123e4567-e89b-12d3-a456-426614174000",
          mode: "VALID_ONLY",
          duplicateResolution: "REPLACE",
        };
        const parsed = commitImportSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
      });

      it("rejects non-UUID sessionToken", () => {
        const payload = {
          sessionToken: "invalid-token",
          mode: "ALL_OR_NOTHING",
        };
        const parsed = commitImportSchema.safeParse(payload);
        expect(parsed.success).toBe(false);
      });

      it("rejects invalid commit mode", () => {
        const payload = {
          sessionToken: "123e4567-e89b-12d3-a456-426614174000",
          mode: "FORCE_ALL",
        };
        const parsed = commitImportSchema.safeParse(payload);
        expect(parsed.success).toBe(false);
      });
    });
  });

  describe("API Client Methods", () => {
    describe("fetchFiscalSetup", () => {
      it("fetches fiscal setup successfully", async () => {
        const responseData = {
          tenantId: "tenant-uuid-1",
          businessName: "Café París",
          ruc: "J0310000012345",
          regime: FiscalRegime.CUOTA_FIJA,
          taxRateIva: 0.0,
          pricesIncludeTax: false,
          commercialFxSpread: 0.5,
        };
        mockFetchSuccess(responseData);

        const result = await fetchFiscalSetup();
        expect(result).toEqual(responseData);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/fiscal-setup",
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({
              Authorization: "Bearer test-owner-token",
            }),
          }),
        );
      });

      it("throws error on failure", async () => {
        mockFetchError(400, "Tenant context is required");
        await expect(fetchFiscalSetup()).rejects.toThrow("Tenant context is required");
      });
    });

    describe("updateFiscalSetup", () => {
      it("sends POST /api/onboarding/fiscal-setup with correct payload", async () => {
        const payload = {
          regime: FiscalRegime.REGIMEN_GENERAL,
          businessName: "Nuevo Restaurante",
          commercialFxSpread: 0.6,
          pricesIncludeTax: true,
          ruc: "J0310000099999",
        };
        const responseData = {
          tenantId: "tenant-uuid-1",
          ...payload,
          taxRateIva: 0.15,
        };
        mockFetchSuccess(responseData);

        const result = await updateFiscalSetup(payload);
        expect(result).toEqual(responseData);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/fiscal-setup",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify(payload),
          }),
        );
      });
    });

    describe("fetchIndustryTemplates", () => {
      it("fetches available templates", async () => {
        const templates = [
          {
            id: "tpl-1",
            code: "CAFETERIA",
            name: "Cafetería & Panadería",
            description: "Catálogo estándar para cafeterías",
            icon: "coffee",
            insumoCount: 12,
            productCount: 8,
          },
          {
            id: "tpl-2",
            code: "BAR_RESTAURANTE",
            name: "Bar & Restaurante",
            description: "Catálogo con comidas y bebidas",
            icon: "utensils",
            insumoCount: 18,
            productCount: 12,
          },
        ];
        mockFetchSuccess(templates);

        const result = await fetchIndustryTemplates();
        expect(result).toEqual(templates);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/templates",
          expect.objectContaining({ method: "GET" }),
        );
      });
    });

    describe("applyIndustryTemplate", () => {
      it("posts to /api/onboarding/templates/:code/apply with options", async () => {
        const response = {
          tenantId: "tenant-1",
          templateCode: "CAFETERIA",
          insumosCreated: 12,
          insumosSkipped: 0,
          productsCreated: 8,
          productsSkipped: 0,
          recipesCreated: 6,
        };
        mockFetchSuccess(response);

        const result = await applyIndustryTemplate("CAFETERIA", {
          overrideExisting: false,
          prefixSku: "CAF-",
        });
        expect(result).toEqual(response);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/templates/CAFETERIA/apply",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ overrideExisting: false, prefixSku: "CAF-" }),
          }),
        );
      });
    });

    describe("uploadImportBatch", () => {
      it("posts batch to /api/onboarding/import/upload", async () => {
        const rows: ImportRowDto[] = [
          { nombre: "Empanada", precioVenta: 35 },
        ];
        const summary = {
          sessionToken: "session-uuid-1",
          totalRows: 1,
          validRows: 1,
          errorRows: 0,
          errors: [],
        };
        mockFetchSuccess(summary);

        const result = await uploadImportBatch({ rows, sessionToken: "session-uuid-1" });
        expect(result).toEqual(summary);
      });
    });

    describe("commitImport", () => {
      it("commits staged import with mode and resolution", async () => {
        const response = {
          sessionToken: "session-uuid-1",
          mode: "VALID_ONLY" as const,
          productsCreated: 50,
          productsUpdated: 0,
          productsSkipped: 0,
          totalCommitted: 50,
          committedAt: new Date().toISOString(),
        };
        mockFetchSuccess(response);

        const result = await commitImport({
          sessionToken: "session-uuid-1",
          mode: "VALID_ONLY",
          duplicateResolution: "REPLACE",
        });
        expect(result).toEqual(response);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/import/commit",
          expect.objectContaining({
            method: "POST",
          }),
        );
      });
    });

    describe("fetchImportErrors", () => {
      it("fetches failed row diagnostics", async () => {
        const errors = {
          sessionToken: "session-uuid-1",
          count: 1,
          errors: [{ rowNumber: 5, rawNombre: "Bad Row", reason: "Precio inválido" }],
        };
        mockFetchSuccess(errors);

        const result = await fetchImportErrors("session-uuid-1");
        expect(result).toEqual(errors);
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/import/errors/session-uuid-1",
          expect.objectContaining({ method: "GET" }),
        );
      });
    });
  });

  describe("ODAV-32 & Triangulation: uploadLargeDatasetInChunks", () => {
    it("Invariant: enforces MAX_IMPORT_CHUNK_SIZE <= 100", () => {
      expect(MAX_IMPORT_CHUNK_SIZE).toBeLessThanOrEqual(100);
    });

    it("Triangulation 1: returns empty summary when rows is empty", async () => {
      const result = await uploadLargeDatasetInChunks([]);
      expect(result.totalRows).toBe(0);
      expect(result.validRows).toBe(0);
      expect(result.errorRows).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("Triangulation 2: processes small dataset (< 100 rows) in a single chunk", async () => {
      const rows: ImportRowDto[] = [
        { nombre: "Item 1", precioVenta: 10 },
        { nombre: "Item 2", precioVenta: 20 },
      ];
      mockFetchSuccess({
        sessionToken: "tok-1",
        totalRows: 2,
        validRows: 2,
        errorRows: 0,
        errors: [],
      });

      const onProgress = vi.fn();
      const result = await uploadLargeDatasetInChunks(rows, { onProgress });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          chunkIndex: 1,
          totalChunks: 1,
          percent: 100,
          uploadedRows: 2,
        }),
      );
    });

    it("Triangulation 3: processes exactly 100 rows in exactly 1 chunk", async () => {
      const rows: ImportRowDto[] = Array.from({ length: 100 }, (_, i) => ({
        nombre: `Item ${i + 1}`,
        precioVenta: 15,
      }));

      mockFetchSuccess({
        sessionToken: "tok-100",
        totalRows: 100,
        validRows: 100,
        errorRows: 0,
        errors: [],
      });

      const result = await uploadLargeDatasetInChunks(rows);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.totalRows).toBe(100);
    });

    it("Triangulation 4 (ODAV-32 Specification): processes 1,500 rows with 20 invalid rows across 15 chunks (<=100 rows per chunk)", async () => {
      // 1,500 rows total: 20 invalid rows dispersed
      const rows: ImportRowDto[] = Array.from({ length: 1500 }, (_, i) => ({
        nombre: i < 20 ? `Invalid ${i + 1}` : `Valid Item ${i + 1}`,
        precioVenta: i < 20 ? -1 : 50,
      }));

      // Mock 15 chunk calls (each 100 rows)
      // Chunk 1 has 20 errors, 80 valid; chunks 2-15 have 100 valid each. Total = 1,480 valid, 20 errors.
      for (let c = 0; c < 15; c++) {
        const errorCount = c === 0 ? 20 : 0;
        const validCount = 100 - errorCount;
        const chunkErrors =
          c === 0
            ? Array.from({ length: 20 }, (_, idx) => ({
                rowNumber: idx + 1,
                rawNombre: `Invalid ${idx + 1}`,
                reason: "El precio de venta debe ser un número positivo",
              }))
            : [];

        mockFetchSuccess({
          sessionToken: "odav-32-token",
          totalRows: (c + 1) * 100,
          validRows: (c * 100) + validCount,
          errorRows: errorCount,
          errors: chunkErrors,
        });
      }

      const progressHistory: number[] = [];
      const result = await uploadLargeDatasetInChunks(rows, {
        chunkSize: 100,
        sessionToken: "odav-32-token",
        onProgress: (p) => progressHistory.push(p.percent),
      });

      // Verification of ODAV-32 constraints:
      expect(fetchSpy).toHaveBeenCalledTimes(15);
      expect(progressHistory.length).toBe(15);
      expect(progressHistory[progressHistory.length - 1]).toBe(100);

      // Reused session token across all chunks
      for (let i = 0; i < 15; i++) {
        const callArgs = fetchSpy.mock.calls[i];
        const bodyStr = callArgs?.[1]?.body as string;
        const callBody = JSON.parse(bodyStr);
        expect(callBody.sessionToken).toBe("odav-32-token");
        expect(callBody.rows.length).toBeLessThanOrEqual(100);
      }

      expect(result.totalRows).toBe(1500);
      expect(result.validRows).toBe(1480);
      expect(result.errorRows).toBe(20);
      expect(result.errors.length).toBe(20);
    });

    it("clamps requested chunkSize to <= 100 if caller passes an oversized chunkSize", async () => {
      const rows: ImportRowDto[] = Array.from({ length: 250 }, (_, i) => ({
        nombre: `Item ${i}`,
        precioVenta: 20,
      }));

      // If user requests chunkSize 500, it MUST be clamped to 100 -> 3 chunks (100, 100, 50)
      for (let c = 0; c < 3; c++) {
        mockFetchSuccess({
          sessionToken: "clamp-token",
          totalRows: (c === 2 ? 250 : (c + 1) * 100),
          validRows: (c === 2 ? 250 : (c + 1) * 100),
          errorRows: 0,
          errors: [],
        });
      }

      await uploadLargeDatasetInChunks(rows, { chunkSize: 500 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string).rows.length).toBe(100);
      expect(JSON.parse(fetchSpy.mock.calls[1]?.[1]?.body as string).rows.length).toBe(100);
      expect(JSON.parse(fetchSpy.mock.calls[2]?.[1]?.body as string).rows.length).toBe(50);
    });
  });
});
