import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/settings-page";
import { FiscalSetupForm } from "@/features/settings/fiscal-setup-form";
import { IndustryTemplatesList } from "@/features/settings/industry-templates-list";
import { BulkImportWizard } from "@/features/settings/bulk-import-wizard";
import { generateOdav32Dataset } from "@/features/settings/odav32-dataset";
import { setTokens, clearTokens } from "@/lib/api";
import { FiscalRegime } from "@/features/settings/types";

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

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "owner-jwt-test", refreshToken: "owner-refresh-test" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe("W9 — Settings & Onboarding Components (TDD & Component Tests)", () => {
  describe("FiscalSetupForm", () => {
    it("renders loading state then populates fetched fiscal setup", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-w9-1",
            businessName: "Café París",
            ruc: "J0310000012345",
            regime: FiscalRegime.CUOTA_FIJA,
            taxRateIva: 0.0,
            pricesIncludeTax: true,
            commercialFxSpread: 0.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(
        <TestWrapper>
          <FiscalSetupForm />
        </TestWrapper>,
      );

      // Loading state
      expect(screen.getByTestId("fiscal-loading")).toBeInTheDocument();

      // Form loaded
      await waitFor(() => {
        expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue("Café París")).toBeInTheDocument();
      expect(screen.getByDisplayValue("J0310000012345")).toBeInTheDocument();
      expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();

      // ODAV-31 Invariant notice is present
      expect(
        screen.getByText(/Garantía de Inmutabilidad DGI \(DT 09-2007\)/i),
      ).toBeInTheDocument();
    });

    it("validates required businessName and submits updated fiscal setup", async () => {
      const user = userEvent.setup();

      // GET initial setup
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-w9-1",
            businessName: "Negocio Inicial",
            ruc: "",
            regime: FiscalRegime.CUOTA_FIJA,
            taxRateIva: 0.0,
            pricesIncludeTax: false,
            commercialFxSpread: 0.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(
        <TestWrapper>
          <FiscalSetupForm />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("fiscal-setup-form")).toBeInTheDocument();
      });

      const businessNameInput = screen.getByLabelText(/Nombre Comercial/i);
      const rucInput = screen.getByLabelText(/RUC/i);
      const regimeSelect = screen.getByLabelText(/Régimen Fiscal/i);
      const saveBtn = screen.getByTestId("save-fiscal-setup-button");

      // Update values
      await user.clear(businessNameInput);
      await user.type(businessNameInput, "Restaurante Gourmet S.A.");
      await user.clear(rucInput);
      await user.type(rucInput, "J0310000099999");
      await user.selectOptions(regimeSelect, FiscalRegime.REGIMEN_GENERAL);

      // Mock POST update response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-w9-1",
            businessName: "Restaurante Gourmet S.A.",
            ruc: "J0310000099999",
            regime: FiscalRegime.REGIMEN_GENERAL,
            taxRateIva: 0.15,
            pricesIncludeTax: false,
            commercialFxSpread: 0.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(saveBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/onboarding/fiscal-setup",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("Restaurante Gourmet S.A."),
          }),
        );
      });
    });
  });

  describe("IndustryTemplatesList", () => {
    const sampleTemplates = [
      {
        id: "tpl-1",
        code: "CAFETERIA",
        name: "Cafetería & Panadería",
        description: "Catálogo estándar para cafeterías con insumos base",
        icon: "coffee",
        insumoCount: 12,
        productCount: 8,
      },
      {
        id: "tpl-2",
        code: "BAR_RESTAURANTE",
        name: "Bar & Restaurante",
        description: "Hamburguesas, cervezas y bebidas",
        icon: "utensils",
        insumoCount: 18,
        productCount: 12,
      },
    ];

    it("renders templates and shows ODAV-34 blast radius 0 notice", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sampleTemplates), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(
        <TestWrapper>
          <IndustryTemplatesList />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("template-card-CAFETERIA")).toBeInTheDocument();
      });

      expect(screen.getByTestId("template-card-BAR_RESTAURANTE")).toBeInTheDocument();
      expect(
        screen.getByText(/Aislamiento de Tenant Garantizado \(Blast Radius = 0\)/i),
      ).toBeInTheDocument();
    });

    it("opens dialog, applies template and displays result counters", async () => {
      const user = userEvent.setup();

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(sampleTemplates), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(
        <TestWrapper>
          <IndustryTemplatesList />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("apply-template-btn-CAFETERIA")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("apply-template-btn-CAFETERIA"));

      // Dialog opens
      expect(screen.getByText(/Aplicar Plantilla: Cafetería & Panadería/i)).toBeInTheDocument();

      // Checkbox override
      const checkbox = screen.getByTestId("override-existing-checkbox");
      await user.click(checkbox);

      // Mock apply response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tenantId: "tenant-w9-1",
            templateCode: "CAFETERIA",
            insumosCreated: 12,
            insumosSkipped: 0,
            productsCreated: 8,
            productsSkipped: 0,
            recipesCreated: 6,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByTestId("confirm-apply-template-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("apply-template-result")).toBeInTheDocument();
      });

      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("6")).toBeInTheDocument();
    });
  });

  describe("BulkImportWizard (ODAV-32 & ODAV-33)", () => {
    it("parses client-onboarding plantilla_productos.csv headers flawlessly", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <BulkImportWizard />
        </TestWrapper>,
      );

      const sampleCsv = `nombre,precio_venta,unidad_venta,es_preparado,categoria,sku,tiene_variantes
Espresso Sencillo,30.00,unidad,true,Bebidas Calientes,ESS01,false
Cappuccino 12oz,45.00,unidad,true,Bebidas Calientes,CAP12,true
Croissant Mantequilla,30.00,unidad,false,Panadería,CRO01,false`;

      const textarea = screen.getByTestId("raw-csv-textarea");
      await user.clear(textarea);
      await user.type(textarea, sampleCsv);

      const processBtn = screen.getByRole("button", { name: /Procesar Texto/i });
      await user.click(processBtn);

      expect(screen.getByText(/3 productos/i)).toBeInTheDocument();
    });
    it("generates exact ODAV-32 dataset: 1,500 total, 1,480 valid, 20 invalid", () => {
      const dataset = generateOdav32Dataset();
      expect(dataset.length).toBe(1500);

      const invalidRows = dataset.filter((r) => typeof r.precioVenta === "number" && r.precioVenta < 0);
      expect(invalidRows.length).toBe(20);
      expect(dataset.length - invalidRows.length).toBe(1480);
    });

    it("executes chunked upload, renders diagnostics and commits valid products", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <BulkImportWizard />
        </TestWrapper>,
      );

      // Click "Cargar Escenario ODAV-32"
      const loadFixtureBtn = screen.getByTestId("load-odav32-dataset-btn");
      await user.click(loadFixtureBtn);

      expect(screen.getByText(/1,500 productos/i)).toBeInTheDocument();
      expect(screen.getByText(/15 chunks/i)).toBeInTheDocument();

      // Mock 15 chunk calls
      for (let i = 0; i < 15; i++) {
        fetchSpy.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sessionToken: "session-odav-32-uuid",
              totalRows: (i + 1) * 100,
              validRows: i === 0 ? 80 : 100,
              errorRows: i === 0 ? 20 : 0,
              errors:
                i === 0
                  ? Array.from({ length: 20 }, (_, idx) => ({
                      rowNumber: idx + 1,
                      rawNombre: `Producto Inválido #${idx + 1}`,
                      reason: "El precio de venta debe ser un número positivo",
                    }))
                  : [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // Start upload
      const startUploadBtn = screen.getByTestId("start-upload-btn");
      await user.click(startUploadBtn);

      // Staging summary reached
      await waitFor(() => {
        expect(screen.getByTestId("staging-summary-card")).toBeInTheDocument();
      });

      expect(screen.getByTestId("staging-total-rows")).toHaveTextContent("1500");
      expect(screen.getByTestId("staging-valid-rows")).toHaveTextContent("1480");
      expect(screen.getByTestId("staging-error-rows")).toHaveTextContent("20");

      // Verify diagnostics rows
      const tableBody = screen.getByTestId("staging-errors-table-body");
      expect(tableBody.children.length).toBe(20);

      // Commit valid only
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionToken: "session-odav-32-uuid",
            mode: "VALID_ONLY",
            productsCreated: 1480,
            productsUpdated: 0,
            productsSkipped: 0,
            totalCommitted: 1480,
            committedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const commitBtn = screen.getByTestId("confirm-commit-btn");
      await user.click(commitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("import-committed-card")).toBeInTheDocument();
      });

      expect(screen.getByTestId("committed-total")).toHaveTextContent("1480");
      expect(screen.getByTestId("committed-created")).toHaveTextContent("1480");
    });
  });

  describe("SettingsPage Tabs Navigation", () => {
    it("navigates between Fiscal, Templates, and Import tabs smoothly", async () => {
      const user = userEvent.setup();

      // Mock initial fiscal query
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            tenantId: "tenant-w9-1",
            businessName: "Café París",
            regime: FiscalRegime.CUOTA_FIJA,
            taxRateIva: 0.0,
            pricesIncludeTax: false,
            commercialFxSpread: 0.5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(
        <TestWrapper>
          <SettingsPage />
        </TestWrapper>,
      );

      expect(screen.getByTestId("tabpanel-fiscal")).toBeInTheDocument();

      // Switch to Templates tab
      await user.click(screen.getByTestId("tab-templates"));
      expect(screen.getByTestId("tabpanel-templates")).toBeInTheDocument();

      // Switch to Import tab
      await user.click(screen.getByTestId("tab-import"));
      expect(screen.getByTestId("tabpanel-import")).toBeInTheDocument();
    });
  });
});
