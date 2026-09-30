/**
 * Menu import from Excel — wizard component tests (SOHO go-live readiness).
 *
 * The owner flow is: download template → fill → upload → preview → commit.
 * These tests mock the settings API module and verify the wizard contract:
 * tab placement, preview counts, insumo review note, error-gated confirm,
 * commit success summary, and the client-side .xlsx-only guard.
 */
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/settings-page";
import {
  downloadMenuImportTemplate,
  previewMenuImport,
  commitMenuImport,
} from "@/features/settings/settings-api";
import type { MenuImportSummary } from "@/features/settings/settings-api";

vi.mock("@/features/settings/settings-api", () => ({
  MENU_IMPORT_TEMPLATE_FILENAME: "plantilla_menu.xlsx",
  MENU_IMPORT_MAX_FILE_BYTES: 3.5 * 1024 * 1024,
  downloadMenuImportTemplate: vi.fn(),
  previewMenuImport: vi.fn(),
  commitMenuImport: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function QueryWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  // The wizard navigates to /inventory?tab=insumos after a commit (BX-019),
  // so the whole page render happens inside a router.
  return <MemoryRouter><QueryWrapper>{children}</QueryWrapper></MemoryRouter>;
}

function RoutedTestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/settings"]}>
      <QueryWrapper>
        <Routes>
          <Route path="/settings" element={<>{children}</>} />
          <Route path="/inventory" element={<div data-testid="inventory-route" />} />
        </Routes>
      </QueryWrapper>
    </MemoryRouter>
  );
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const makeXlsxFile = (name = "menu.xlsx") =>
  new File(["workbook-bytes"], name, { type: XLSX_MIME });

const summaryWithErrors: MenuImportSummary = {
  categories: 2,
  productsToCreate: 2,
  productsToUpdate: 1,
  recipesToCreate: 2,
  recipesSkipped: [
    {
      productName: "Latte",
      reason: "VERSION_ALREADY_EXISTS",
      existingState: "PUBLISHED",
    },
  ],
  insumosToCreate: [
    { name: "Leche", purchaseUom: "L", consumptionUom: "L", review: true },
  ],
  errors: [
    {
      sheet: "CAFÉ HELADO",
      row: 7,
      message: "Row is missing 'producto'",
    },
  ],
  warnings: [
    {
      sheet: "VACÍA",
      row: 1,
      message: "Sheet 'VACÍA' has no data rows",
    },
  ],
};

const cleanSummary: MenuImportSummary = {
  categories: 2,
  productsToCreate: 2,
  productsToUpdate: 0,
  recipesToCreate: 2,
  recipesSkipped: [],
  insumosToCreate: [
    { name: "Café molido", purchaseUom: "g", consumptionUom: "g", review: true },
  ],
  errors: [],
  warnings: [],
};

async function uploadFile(file: File) {
  const user = userEvent.setup();
  const input = screen.getByTestId("menu-import-file-input");
  await user.upload(input, file);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("MenuImportWizard", () => {
  it("renders the wizard inside the settings import tab alongside the bulk import", async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SettingsPage />
      </TestWrapper>,
    );

    await user.click(screen.getByTestId("tab-import"));
    expect(screen.getByTestId("tabpanel-import")).toBeInTheDocument();

    expect(screen.getByText(/Importar menú \(Excel\)/i)).toBeInTheDocument();
    expect(
      screen.getByTestId("menu-import-download-template-btn"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("menu-import-file-input")).toBeInTheDocument();
    // The existing bulk import wizard stays reachable in the same tab.
    expect(screen.getByText(/Carga Masiva de Productos/i)).toBeInTheDocument();
  });

  it("downloads the template as a blob from the template endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadMenuImportTemplate).mockResolvedValue(
      new Blob(["xlsx-bytes"], { type: XLSX_MIME }),
    );
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await user.click(screen.getByTestId("menu-import-download-template-btn"));

    await waitFor(() => {
      expect(downloadMenuImportTemplate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it("preview renders counts, the insumo review note, and errors with sheet and row", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(summaryWithErrors);

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await uploadFile(makeXlsxFile());

    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    expect(screen.getByTestId("menu-import-count-categories")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-count-products-create")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-count-products-update")).toHaveTextContent("1");
    expect(screen.getByTestId("menu-import-count-recipes-create")).toHaveTextContent("2");

    // Review note for created insumos (cost + PAR follow-up).
    expect(
      screen.getByTestId("menu-import-insumo-review-note"),
    ).toBeInTheDocument();
    expect(screen.getByText("Leche")).toBeInTheDocument();

    // Skipped recipes surface with their reason.
    expect(screen.getByText(/Latte/i)).toBeInTheDocument();

    // Errors table carries sheet + Excel row + message.
    expect(screen.getByTestId("menu-import-errors-table-body")).toHaveTextContent(
      "CAFÉ HELADO",
    );
    expect(screen.getByTestId("menu-import-errors-table-body")).toHaveTextContent(
      "7",
    );
    // Row-issues block is a destructive alert (§42.1): failure ≠ near-white.
    expect(screen.getByTestId("menu-import-errors-block")).toHaveClass(
      "bg-destructive/10",
      "text-destructive",
    );
    // Warnings render in their own table.
    expect(screen.getByTestId("menu-import-warnings-table-body")).toHaveTextContent(
      "VACÍA",
    );
  });

  it("disables confirm while errors exist and enables it when the preview is clean", async () => {
    vi.mocked(previewMenuImport).mockResolvedValueOnce(summaryWithErrors);

    const first = render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("menu-import-confirm-btn")).toBeDisabled();
    first.unmount();

    vi.mocked(previewMenuImport).mockResolvedValueOnce(cleanSummary);
    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("menu-import-confirm-btn")).toBeEnabled();
  });

  it("commits on confirm and renders the success summary", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(cleanSummary);
    vi.mocked(commitMenuImport).mockResolvedValue({
      ...cleanSummary,
      productsToCreate: 2,
      recipesToCreate: 2,
    });

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-import-confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("menu-import-committed-card")).toBeInTheDocument();
    });

    expect(commitMenuImport).toHaveBeenCalledTimes(1);
    // Commit re-posts the same base64 payload (no server-side staging).
    const committedPayload = vi.mocked(commitMenuImport).mock.calls[0]?.[0];
    expect(typeof committedPayload).toBe("string");
    expect(committedPayload?.length ?? 0).toBeGreaterThan(0);

    // Success receipt uses the semantic success palette, not a near-white tint.
    expect(screen.getByTestId("menu-import-receipt-alert")).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700",
    );

    expect(screen.getByTestId("menu-import-committed-categories")).toHaveTextContent("2");
    expect(screen.getByTestId("menu-import-committed-products-create")).toHaveTextContent("2");
  });

  it("rejects a non-.xlsx file client-side without calling the API", async () => {
    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    // fireEvent bypasses the input's accept=".xlsx" filter (browser drop/programmatic
    // paths still deliver non-xlsx files); the wizard must guard client-side.
    const input = screen.getByTestId("menu-import-file-input");
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "menu.pdf", { type: "application/pdf" })] },
    });

    expect(screen.getByTestId("menu-import-client-error")).toBeInTheDocument();
    expect(screen.getByTestId("menu-import-client-error")).toHaveClass(
      "bg-destructive/10",
      "text-destructive",
    );
    expect(previewMenuImport).not.toHaveBeenCalled();
    expect(commitMenuImport).not.toHaveBeenCalled();
  });

  it("states the true size limit (3,5 MB) when rejecting an oversized file (AT-06 / BX-011)", async () => {
    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );

    const oversized = new File(
      [new ArrayBuffer(3.5 * 1024 * 1024 + 10)],
      "menu.xlsx",
      { type: XLSX_MIME },
    );
    await uploadFile(oversized);

    const error = screen.getByTestId("menu-import-client-error");
    expect(error).toHaveTextContent("El archivo supera el límite de 3,5 MB.");
    expect(error.textContent).not.toContain("4 MB");
    expect(previewMenuImport).not.toHaveBeenCalled();
  });

  it("never renders raw backend enums or English row messages (AT-05 / BX-010)", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(summaryWithErrors);

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());

    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    // Skipped reason and state render as human Spanish labels.
    expect(screen.getByText(/ya tiene una versión de receta/i)).toBeInTheDocument();
    expect(screen.getByText(/estado actual: Publicada/i)).toBeInTheDocument();
    expect(screen.queryByText(/VERSION_ALREADY_EXISTS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PUBLISHED/)).not.toBeInTheDocument();

    // Row error/warning messages are normalized to actionable Spanish.
    const errorsTable = screen.getByTestId("menu-import-errors-table-body");
    expect(errorsTable).toHaveTextContent("Falta la columna 'producto' en esta fila.");
    expect(errorsTable.textContent).not.toContain("Row is missing");
    const warningsTable = screen.getByTestId("menu-import-warnings-table-body");
    expect(warningsTable).toHaveTextContent("La hoja 'VACÍA' no tiene filas de datos.");
    expect(warningsTable.textContent).not.toContain("has no data rows");
  });

  it("shows a destructive alert on commit failure and keeps the preview for retry (AT-04 / BX-009)", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(cleanSummary);
    vi.mocked(commitMenuImport).mockRejectedValue({ status: 500 });

    render(
      <TestWrapper>
        <SettingsPage initialTab="import" />
      </TestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-import-confirm-btn"));

    const alert = await screen.findByTestId("menu-import-commit-error");
    expect(alert).toHaveTextContent("No se pudo completar la importación");
    expect(alert).toHaveTextContent(/Error en el servidor/i);
    expect(alert.textContent).not.toContain("500");

    // Nothing was written and the work is not lost: preview stays, receipt does not appear.
    expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-import-committed-card")).not.toBeInTheDocument();
    // Confirm re-enables for retry.
    expect(screen.getByTestId("menu-import-confirm-btn")).toBeEnabled();
  });

  it("links the named next step after commit when new insumos were created (BX-019)", async () => {
    vi.mocked(previewMenuImport).mockResolvedValue(cleanSummary);
    vi.mocked(commitMenuImport).mockResolvedValue(cleanSummary);

    render(
      <RoutedTestWrapper>
        <SettingsPage initialTab="import" />
      </RoutedTestWrapper>,
    );
    await uploadFile(makeXlsxFile());
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-preview-card")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-import-confirm-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("menu-import-committed-card")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("menu-import-go-insumos-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("inventory-route")).toBeInTheDocument();
    });
  });
});
