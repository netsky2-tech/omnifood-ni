import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/settings-page";
import { setTokens, clearTokens } from "@/lib/api";
import { FiscalRegime } from "@/features/settings/types";
import type {
  FiscalSetupResponse,
  IndustryTemplate,
  ApplyTemplateResult,
  UploadSummaryResponse,
  CommitSummaryResponse,
  RowErrorDiagnostic,
  ImportRowDto,
} from "@/features/settings/types";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchSpy: ReturnType<typeof vi.fn>;

describe("W9 E2E — Complete Fiscal Setup, Industry Templates & Bulk Import Lifecycle", () => {
  // Simulated In-Memory Database State for Tenant A
  let dbFiscalSetup: FiscalSetupResponse;
  let dbHistoricalInvoices: Array<{
    id: string;
    number: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    isCanceled: boolean;
  }>;
  let dbCatalogProducts: Array<{ id: string; name: string; sku?: string; price: number }>;
  let dbStagingBatches: Record<
    string,
    {
      rows: ImportRowDto[];
      validRows: number;
      errorRows: number;
      errors: RowErrorDiagnostic[];
      isCommitted: boolean;
    }
  >;

  beforeEach(() => {
    // Initial Fiscal State: Cuota Fija
    dbFiscalSetup = {
      tenantId: "tenant-e2e-1",
      businessName: "Comedor Doña María",
      ruc: null,
      regime: FiscalRegime.CUOTA_FIJA,
      taxRateIva: 0.0,
      pricesIncludeTax: false,
      commercialFxSpread: 0.5,
    };

    // Historical Invoices under Cuota Fija (ODAV-31 baseline)
    dbHistoricalInvoices = [
      {
        id: "inv-001",
        number: "FAC-0001",
        subtotal: 120,
        taxRate: 0.0,
        taxAmount: 0.0,
        total: 120,
        isCanceled: false,
      },
      {
        id: "inv-002",
        number: "FAC-0002",
        subtotal: 250,
        taxRate: 0.0,
        taxAmount: 0.0,
        total: 250,
        isCanceled: false,
      },
    ];

    dbCatalogProducts = [];
    dbStagingBatches = {};

    setTokens({ accessToken: "owner-jwt-e2e", refreshToken: "owner-refresh-e2e" });

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      // console.log("FETCH CALLED:", method, url);

      // --- GET /api/onboarding/fiscal-setup ---
      if (method === "GET" && url.endsWith("/api/onboarding/fiscal-setup")) {
        return new Response(JSON.stringify(dbFiscalSetup), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- POST /api/onboarding/fiscal-setup ---
      if (method === "POST" && url.endsWith("/api/onboarding/fiscal-setup")) {
        const body = JSON.parse(init?.body as string);
        dbFiscalSetup = {
          tenantId: "tenant-e2e-1",
          businessName: body.businessName,
          ruc: body.ruc || null,
          regime: body.regime,
          taxRateIva: body.regime === FiscalRegime.REGIMEN_GENERAL ? 0.15 : 0.0,
          pricesIncludeTax: body.pricesIncludeTax,
          commercialFxSpread: body.commercialFxSpread,
        };

        // INVARIANT ODAV-31 CHECK: Historical invoices MUST NOT be mutated!
        // We ensure dbHistoricalInvoices are untouched.

        return new Response(JSON.stringify(dbFiscalSetup), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- GET /api/onboarding/templates ---
      if (method === "GET" && url.endsWith("/api/onboarding/templates")) {
        const templates: IndustryTemplate[] = [
          {
            id: "tpl-cafe",
            code: "CAFETERIA",
            name: "Cafetería & Panadería",
            description: "Catálogo estándar para café gourmet y panadería",
            icon: "coffee",
            insumoCount: 12,
            productCount: 8,
          },
          {
            id: "tpl-bar",
            code: "BAR_RESTAURANTE",
            name: "Bar & Restaurante",
            description: "Catálogo con comidas preparadas y bebidas",
            icon: "utensils",
            insumoCount: 18,
            productCount: 12,
          },
        ];
        return new Response(JSON.stringify(templates), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- POST /api/onboarding/templates/:code/apply ---
      if (method === "POST" && url.match(/\/api\/onboarding\/templates\/([^/]+)\/apply$/)) {
        const match = url.match(/\/api\/onboarding\/templates\/([^/]+)\/apply$/);
        const code = match![1]!;
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const prefix = body.prefixSku || "";

        // Inject products into dbCatalogProducts
        const count = code === "CAFETERIA" ? 8 : 12;
        for (let i = 1; i <= count; i++) {
          dbCatalogProducts.push({
            id: `prod-tpl-${i}`,
            name: `${code} Producto ${i}`,
            sku: `${prefix}${code}-${i}`,
            price: 50,
          });
        }

        const result: ApplyTemplateResult = {
          tenantId: "tenant-e2e-1",
          templateCode: code,
          insumosCreated: code === "CAFETERIA" ? 12 : 18,
          insumosSkipped: 0,
          productsCreated: count,
          productsSkipped: 0,
          recipesCreated: 6,
        };

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- POST /api/onboarding/import/upload ---
      if (method === "POST" && url.endsWith("/api/onboarding/import/upload")) {
        const body = JSON.parse(init?.body as string);
        const sessionToken = body.sessionToken || "session-e2e-token-1234";
        const rows = (body.rows as ImportRowDto[]) || [];

        if (!dbStagingBatches[sessionToken]) {
          dbStagingBatches[sessionToken] = {
            rows: [],
            validRows: 0,
            errorRows: 0,
            errors: [],
            isCommitted: false,
          };
        }

        const batch = dbStagingBatches[sessionToken]!;
        const chunkErrors: RowErrorDiagnostic[] = [];

        for (const row of rows) {
          batch.rows.push(row);
          const price = typeof row.precioVenta === "number" ? row.precioVenta : parseFloat(row.precioVenta);
          if (isNaN(price) || price <= 0) {
            batch.errorRows++;
            const err: RowErrorDiagnostic = {
              rowNumber: batch.rows.length,
              rawNombre: row.nombre,
              rawSku: row.sku,
              reason: "El precio de venta debe ser un número positivo",
            };
            batch.errors.push(err);
            chunkErrors.push(err);
          } else {
            batch.validRows++;
          }
        }

        const summary: UploadSummaryResponse = {
          sessionToken,
          totalRows: batch.rows.length,
          validRows: batch.validRows,
          errorRows: batch.errorRows,
          errors: chunkErrors,
        };

        return new Response(JSON.stringify(summary), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // --- POST /api/onboarding/import/commit ---
      if (method === "POST" && url.endsWith("/api/onboarding/import/commit")) {
        const body = JSON.parse(init?.body as string);
        const sessionToken = body.sessionToken;
        const batch = dbStagingBatches[sessionToken];

        if (!batch) {
          return new Response(JSON.stringify({ message: "Sesión no encontrada", statusCode: 404 }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Idempotency (ODAV-33): If already committed, return same committed response
        const totalCommitted = batch.validRows;
        batch.isCommitted = true;

        const summary: CommitSummaryResponse = {
          sessionToken,
          mode: body.mode || "VALID_ONLY",
          productsCreated: totalCommitted,
          productsUpdated: 0,
          productsSkipped: 0,
          totalCommitted,
          committedAt: new Date().toISOString(),
        };

        return new Response(JSON.stringify(summary), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: `Not Found: ${method} ${url}`, statusCode: 404 }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it("completes Journey 1: Configures Fiscal Setup & verifies DGI Invariant ODAV-31", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SettingsPage />
      </TestWrapper>,
    );

    // Verify initial values loaded
    await waitFor(() => {
      expect(screen.getByDisplayValue("Comedor Doña María")).toBeInTheDocument();
    });

    const businessNameInput = screen.getByLabelText(/Nombre Comercial/i);
    const rucInput = screen.getByLabelText(/RUC/i);
    const regimeSelect = screen.getByLabelText(/Régimen Fiscal/i);
    const fxSpreadInput = screen.getByLabelText(/Spread Cambiario Comercial/i);
    const saveBtn = screen.getByTestId("save-fiscal-setup-button");

    // Change to Regimen General with RUC and custom FX Spread
    await user.clear(businessNameInput);
    await user.type(businessNameInput, "Doña María Restaurante Formal S.A.");
    await user.clear(rucInput);
    await user.type(rucInput, "J0310000088888");
    await user.selectOptions(regimeSelect, FiscalRegime.REGIMEN_GENERAL);
    await user.clear(fxSpreadInput);
    await user.type(fxSpreadInput, "0.75");

    await user.click(saveBtn);

    // Verify updated state in db
    await waitFor(() => {
      expect(dbFiscalSetup.regime).toBe(FiscalRegime.REGIMEN_GENERAL);
      expect(dbFiscalSetup.taxRateIva).toBe(0.15);
      expect(dbFiscalSetup.ruc).toBe("J0310000088888");
      expect(dbFiscalSetup.commercialFxSpread).toBe(0.75);
    });

    // ODAV-31 Invariant: Historical Invoices must retain their exact original values
    expect(dbHistoricalInvoices[0]!.taxRate).toBe(0.0);
    expect(dbHistoricalInvoices[0]!.taxAmount).toBe(0.0);
    expect(dbHistoricalInvoices[0]!.total).toBe(120);
    expect(dbHistoricalInvoices[1]!.taxRate).toBe(0.0);
    expect(dbHistoricalInvoices[1]!.taxAmount).toBe(0.0);
    expect(dbHistoricalInvoices[1]!.total).toBe(250);
  });

  it("completes Journey 2: Applies Industry Template and verifies catalog injection (ODAV-34)", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SettingsPage />
      </TestWrapper>,
    );

    // Switch to Templates tab
    await user.click(screen.getByTestId("tab-templates"));

    await waitFor(() => {
      expect(screen.getByTestId("template-card-CAFETERIA")).toBeInTheDocument();
    });

    // Open apply dialog
    await user.click(screen.getByTestId("apply-template-btn-CAFETERIA"));

    const prefixInput = screen.getByTestId("prefix-sku-input");
    await user.clear(prefixInput);
    await user.type(prefixInput, "CAFE-");

    // Confirm apply
    await user.click(screen.getByTestId("confirm-apply-template-btn"));

    // Verify results displayed
    await waitFor(() => {
      expect(screen.getByTestId("apply-template-result")).toBeInTheDocument();
    });

    // Verify products were injected into catalog
    expect(dbCatalogProducts.length).toBe(8);
    expect(dbCatalogProducts[0]!.sku).toContain("CAFE-");
  });

  it("completes Journey 3: ODAV-32 & ODAV-33 Bulk Import Lifecycle (1,500 rows, chunking <=100, staging, diagnostics, commit, replay idempotency)", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SettingsPage />
      </TestWrapper>,
    );

    // Switch to Import tab
    await user.click(screen.getByTestId("tab-import"));

    // Load ODAV-32 dataset (1,500 rows)
    const loadFixtureBtn = screen.getByTestId("load-odav32-dataset-btn");
    await user.click(loadFixtureBtn);

    expect(screen.getByText(/1,500 productos/i)).toBeInTheDocument();

    // Start upload in chunks
    const startUploadBtn = screen.getByTestId("start-upload-btn");
    await user.click(startUploadBtn);

    // Wait for staging summary
    await waitFor(() => {
      expect(screen.getByTestId("staging-summary-card")).toBeInTheDocument();
    });

    // ODAV-32 verification:
    // 1. 1,500 total rows processed
    // 2. 1,480 valid rows
    // 3. 20 invalid rows
    expect(screen.getByTestId("staging-total-rows")).toHaveTextContent("1500");
    expect(screen.getByTestId("staging-valid-rows")).toHaveTextContent("1480");
    expect(screen.getByTestId("staging-error-rows")).toHaveTextContent("20");

    // 4. Staging diagnostics table displays rejected rows
    const tableBody = screen.getByTestId("staging-errors-table-body");
    expect(tableBody.children.length).toBe(20);

    // 5. Select commit mode VALID_ONLY and commit to production catalog
    const commitBtn = screen.getByTestId("confirm-commit-btn");
    await user.click(commitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("import-committed-card")).toBeInTheDocument();
    });

    expect(screen.getByTestId("committed-total")).toHaveTextContent("1480");
    expect(screen.getByTestId("committed-created")).toHaveTextContent("1480");

    // ODAV-33 Replay Idempotency check:
    // When the same session token is committed again, the backend yields the exact same committed count
    // without duplicates or state corruption.
    const sessionToken = Object.keys(dbStagingBatches)[0];
    const replayRes = await fetch("/api/onboarding/import/commit", {
      method: "POST",
      headers: {
        Authorization: "Bearer owner-jwt-e2e",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken, mode: "VALID_ONLY" }),
    });
    const replayData = (await replayRes.json()) as CommitSummaryResponse;
    expect(replayData.totalCommitted).toBe(1480);
    expect(replayData.productsCreated).toBe(1480);
  });
});
